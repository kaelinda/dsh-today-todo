/**
 * Durable todo storage for the `dsh-todos` bundle.
 *
 * One JSON document under the DSH home keeps the list independent of any single
 * Session or browser profile, so the panel and the agent tool read and write the
 * same items. Durability and multi-process safety are deliberate here:
 *
 * - Writes go to a temporary file, are fsynced, then renamed over the document,
 *   and the directory is fsynced best-effort, so a crash cannot leave a torn
 *   document behind.
 * - A mutation takes an exclusive lock file and re-reads the document under it,
 *   so two DSH processes sharing one file merge their edits instead of each
 *   overwriting the other from a stale in-memory list.
 * - A missing, unreadable, or corrupt document degrades to an empty list. A
 *   corrupt document is first moved aside to `<file>.corrupt-<timestamp>`, so
 *   the data is recoverable instead of being silently dropped.
 *
 * Each item carries optional planning detail besides its title:
 * - `tags` — free-form module/category labels (at most {@link MAX_TAGS}).
 * - `priority` — one of `P0`–`P3`, or null when not ranked.
 * - `quadrant` — Eisenhower classification `q1`–`q4`, or null when unset.
 * - `todayDate` — the local day the item was put into the "today" focus list, so
 *   the focus list resets on its own each day while the record keeps its date.
 */
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Document schema version; bumped when the stored shape changes. */
const DOCUMENT_VERSION = 2;
/** Upper bound on tracked items, so one runaway caller cannot grow the file without limit. */
const MAX_ITEMS = 500;
/** Upper bound on one title, in characters. */
const MAX_TITLE = 200;
/** Upper bound on one tag, in characters. */
const MAX_TAG = 24;
/** Upper bound on tags per item. */
const MAX_TAGS = 8;
/** How long a mutation waits for another process's lock before reporting busy. */
const LOCK_TIMEOUT_MS = 2000;
/** Delay between lock acquisition attempts. */
const LOCK_RETRY_MS = 15;
/** A lock older than this is treated as abandoned by a crashed process. */
const LOCK_STALE_MS = 10_000;
/** Priority levels, most urgent first. */
export const PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
/** Eisenhower quadrants: important/urgent, important/not, urgent/not, neither. */
export const QUADRANTS = Object.freeze(['q1', 'q2', 'q3', 'q4']);

/** Shared buffer for the synchronous backoff used while a lock is held elsewhere. */
const SLEEP_BUFFER = typeof SharedArrayBuffer === 'function' ? new Int32Array(new SharedArrayBuffer(4)) : null;

/**
 * Block the current thread for a short, bounded time.
 * @param ms - milliseconds to wait.
 */
function sleep(ms) {
  if (SLEEP_BUFFER !== null) {
    Atomics.wait(SLEEP_BUFFER, 0, 0, ms);
    return;
  }
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // Fallback for runtimes without SharedArrayBuffer; contention is rare.
  }
}

/**
 * Resolve the default document path: `$DSH_TODOS_FILE`, else `$DSH_HOME/dsh-todos/todos.json`.
 * @param env - process environment to read.
 * @returns absolute document path.
 */
export function defaultDataFile(env = process.env) {
  const override = env.DSH_TODOS_FILE;
  if (typeof override === 'string' && override !== '') return override;
  const home = env.DSH_HOME || join(homedir(), '.dsh');
  return join(home, 'dsh-todos', 'todos.json');
}

/**
 * Local calendar day of the Host, used for the "today" focus list.
 * @param date - instant to format; defaults to now.
 * @returns `YYYY-MM-DD` in the Host's local time zone.
 */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalize one human-entered title.
 * @param value - candidate title.
 * @returns trimmed single-line title, or an empty string.
 */
function normalizeTitle(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
}

/**
 * Normalize an optional Session id.
 * @param value - candidate id.
 * @returns the id, or null when the caller cleared the link.
 */
function normalizeSessionId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Normalize an optional Session label captured at link time.
 * @param value - candidate label.
 * @returns the label, or null.
 */
function normalizeSessionTitle(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return trimmed === '' ? null : trimmed;
}

/**
 * Normalize a tag list: trimmed, `#`-stripped, de-duplicated case-insensitively.
 * @param value - candidate tags.
 * @returns a bounded list of clean tags.
 */
export function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const tag = candidate.replace(/\s+/g, ' ').trim().replace(/^#+/, '').slice(0, MAX_TAG);
    if (tag === '') continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/**
 * Normalize one priority level.
 * @param value - `P0`–`P3`, or nullish.
 * @returns the canonical level, or null when unranked.
 */
export function normalizePriority(value) {
  if (typeof value !== 'string') return null;
  const priority = value.trim().toUpperCase();
  return PRIORITIES.includes(priority) ? priority : null;
}

/**
 * Normalize one Eisenhower quadrant.
 * @param value - `q1`–`q4`, or nullish.
 * @returns the canonical quadrant, or null when unset.
 */
export function normalizeQuadrant(value) {
  if (typeof value !== 'string') return null;
  const quadrant = value.trim().toLowerCase();
  return QUADRANTS.includes(quadrant) ? quadrant : null;
}

/**
 * Normalize a stored "today" day key.
 * @param value - candidate `YYYY-MM-DD`.
 * @returns the day key, or null.
 */
export function normalizeTodayDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Turn an unknown thrown value into one short message.
 * @param error - anything thrown.
 * @returns display/debug text.
 */
function messageOf(error) {
  if (error instanceof Error && error.message !== '') return error.message;
  return String(error);
}

/**
 * Resolve the requested "today" state from either the day key or the boolean
 * convenience flag the panel and the agent tool use.
 * @param request - a mutation request that may carry `today` or `todayDate`.
 * @param fallback - value to keep when neither field is present.
 * @returns `{ known, todayDate }`; `known` is false when the request is silent.
 */
function resolveToday(request, fallback) {
  if (request?.today === true) return { known: true, todayDate: localDateKey() };
  if (request?.today === false) return { known: true, todayDate: null };
  if (request?.todayDate !== undefined) return { known: true, todayDate: normalizeTodayDate(request.todayDate) };
  return { known: false, todayDate: fallback };
}

/**
 * Coerce one stored record into the current shape, dropping unusable rows.
 * @param raw - value read from the document.
 * @returns a normalized item, or null when the record cannot be repaired.
 */
function normalizeStoredItem(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : null;
  const title = normalizeTitle(raw.title);
  if (id === null || title === '') return null;
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  const todayDate = normalizeTodayDate(raw.todayDate);
  const todayAt = todayDate === null || typeof raw.todayAt !== 'number' || !Number.isFinite(raw.todayAt) ? null : raw.todayAt;
  return {
    id,
    title,
    done: raw.done === true,
    createdAt,
    updatedAt,
    sessionId: normalizeSessionId(raw.sessionId),
    sessionTitle: normalizeSessionTitle(raw.sessionTitle),
    tags: normalizeTags(raw.tags),
    priority: normalizePriority(raw.priority),
    quadrant: normalizeQuadrant(raw.quadrant),
    todayDate,
    todayAt,
  };
}

/**
 * Create a monotonically increasing short id that stays readable in a session id link.
 * @returns a fresh todo id.
 */
function createId() {
  return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Read the document and classify the outcome instead of flattening every failure
 * to an empty list: the caller needs to tell "not created yet" from "corrupt" so
 * only the latter is moved aside.
 * @param file - document path.
 * @param readFile - reader injection for tests.
 * @param statFile - stat injection for tests.
 * @returns `{ status, items, revision, mtimeMs, error }` where status is
 *   `ok`, `missing`, `unreadable`, or `corrupt`.
 */
function readDocument(file, readFile, statFile) {
  if (!file) return { status: 'missing', items: [], revision: 0, mtimeMs: null, error: null };
  let text;
  try {
    text = readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'missing', items: [], revision: 0, mtimeMs: null, error: null };
    }
    return { status: 'unreadable', items: [], revision: 0, mtimeMs: null, error: messageOf(error) };
  }
  let mtimeMs = null;
  try {
    mtimeMs = statFile(file).mtimeMs;
  } catch {
    mtimeMs = null;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { status: 'corrupt', items: [], revision: 0, mtimeMs, error: `invalid JSON: ${messageOf(error)}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.items)) {
    return { status: 'corrupt', items: [], revision: 0, mtimeMs, error: 'document has no items array' };
  }
  const items = [];
  for (const entry of parsed.items) {
    const item = normalizeStoredItem(entry);
    if (item !== null) items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  const revision = Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0;
  return { status: 'ok', items, revision, mtimeMs, error: null };
}

/**
 * Build the sibling path used to preserve a corrupt document.
 * @param file - document path.
 * @returns a unique backup path beside the document.
 */
function corruptBackupPath(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${file}.corrupt-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create the todo store shared by the HTTP panel API and the agent tool.
 *
 * All mutating methods accept an optional `baseRevision`. When present, the
 * mutation is rejected with `todo_revision_conflict` if another writer advanced
 * the document since the caller's snapshot, so a stale panel cannot overwrite a
 * newer list. The agent tool omits it and therefore always works on the latest
 * document under the file lock.
 *
 * @param options - optional document path plus filesystem injections for tests.
 */
export function createTodoStore(options = {}) {
  const file = options.file === undefined ? defaultDataFile(options.env ?? process.env) : options.file;
  const readFile = options.readFile ?? readFileSync;
  const writeFile = options.writeFile ?? writeFileSync;
  const moveFile = options.moveFile ?? renameSync;
  const makeDirectory = options.makeDirectory ?? mkdirSync;
  const removeFile = options.removeFile ?? unlinkSync;
  const statFile = options.statFile ?? statSync;
  const openFile = options.openFile ?? openSync;
  const closeFile = options.closeFile ?? closeSync;
  const fsync = options.fsync ?? fsyncSync;
  const warn = options.warn ?? ((message) => console.warn(`[dsh-todos] ${message}`));
  const lockTimeoutMs = options.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  const lockStaleMs = options.lockStaleMs ?? LOCK_STALE_MS;
  const syncFile = options.syncFile ?? ((path) => {
    const fd = openFile(path, 'r');
    try {
      fsync(fd);
    } finally {
      closeFile(fd);
    }
  });
  const syncDirectory = options.syncDirectory ?? ((path) => {
    let fd = null;
    try {
      fd = openFile(path, 'r');
      fsync(fd);
    } catch {
      // Windows and some filesystems refuse to fsync a directory; the rename
      // itself is still atomic there, so this is best-effort only.
    } finally {
      if (fd !== null) {
        try {
          closeFile(fd);
        } catch {
          // Closing a directory handle after a failed fsync is best-effort too.
        }
      }
    }
  });

  /** Move a corrupt document aside so the next write can start clean. */
  const backupCorrupt = (reason) => {
    if (!file) return null;
    const backup = corruptBackupPath(file);
    try {
      moveFile(file, backup);
      const message = `corrupt todo document moved to ${backup} (${reason})`;
      warn(message);
      return message;
    } catch (error) {
      const message = `unable to back up corrupt todo document: ${messageOf(error)}`;
      warn(message);
      return message;
    }
  };

  const initial = readDocument(file, readFile, statFile);
  let items = initial.items;
  let revision = Math.max(1, initial.revision);
  let fileMtimeMs = initial.mtimeMs;
  let lastError = null;
  // True while an in-memory change has not reached the document yet. A reload
  // must not discard it, even if another process wrote the file meanwhile.
  let dirty = false;

  if (initial.status === 'corrupt') {
    lastError = backupCorrupt(initial.error);
  } else if (initial.status === 'unreadable') {
    lastError = `unable to read todo document: ${initial.error}`;
    warn(lastError);
  }

  /** Write the whole document; a failure is reported but never thrown at a caller. */
  const persist = () => {
    if (!file) {
      dirty = false;
      return true;
    }
    const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      makeDirectory(dirname(file), { recursive: true });
      writeFile(temporary, `${JSON.stringify({ version: DOCUMENT_VERSION, revision, items }, null, 2)}\n`, 'utf8');
      try {
        syncFile(temporary);
      } catch (error) {
        // Losing the fsync only weakens crash durability; the rename below is
        // still atomic, so keep the write and surface the problem as a warning.
        warn(`unable to fsync todo document: ${messageOf(error)}`);
      }
      moveFile(temporary, file);
      syncDirectory(dirname(file));
      dirty = false;
      lastError = null;
      try {
        fileMtimeMs = statFile(file).mtimeMs;
      } catch {
        fileMtimeMs = null;
      }
      return true;
    } catch (error) {
      lastError = messageOf(error);
      warn(`unable to save todos: ${lastError}`);
      try {
        removeFile(temporary);
      } catch {
        // The temporary file may already be gone; nothing left to clean up.
      }
      return false;
    }
  };

  /** Adopt a successfully read document, keeping the revision monotonic. */
  const adopt = (document) => {
    items = document.items;
    revision = Math.max(revision, document.revision);
    fileMtimeMs = document.mtimeMs;
  };

  /**
   * Re-read the document if another process changed it. Called by `snapshot()`
   * so a panel polling GET sees edits made by the agent or by a second DSH
   * process, not just edits made through this store instance.
   */
  const refreshFromDisk = () => {
    if (!file || dirty) return false;
    let stat;
    try {
      stat = statFile(file);
    } catch (error) {
      if (error?.code !== 'ENOENT') return false;
      return false;
    }
    if (fileMtimeMs !== null && stat.mtimeMs === fileMtimeMs) return false;
    const document = readDocument(file, readFile, statFile);
    if (document.status === 'ok') {
      adopt(document);
      return true;
    }
    if (document.status === 'corrupt') {
      lastError = backupCorrupt(document.error);
      fileMtimeMs = stat.mtimeMs;
    } else if (document.status === 'unreadable') {
      lastError = `unable to read todo document: ${document.error}`;
      fileMtimeMs = stat.mtimeMs;
    }
    return false;
  };

  /**
   * Re-read the document while the write lock is held. This is what makes two
   * processes merge instead of overwrite: whichever gets the lock last applies
   * its operation to the file the previous writer left behind.
   */
  const reloadUnderLock = () => {
    if (!file || dirty) return;
    const document = readDocument(file, readFile, statFile);
    if (document.status === 'ok') {
      adopt(document);
    } else if (document.status === 'corrupt') {
      // Keep the in-memory list (it is the best copy left) but preserve the
      // damaged file before this mutation writes over it.
      lastError = backupCorrupt(document.error);
      fileMtimeMs = document.mtimeMs;
    } else if (document.status === 'unreadable') {
      lastError = `unable to read todo document: ${document.error}`;
      fileMtimeMs = document.mtimeMs;
    }
  };

  /**
   * Take the document's exclusive lock file, waiting briefly for a competing
   * writer and reclaiming a lock left behind by a crashed process.
   * @returns `{ ok: true, release }` or `{ ok: false, error }`.
   */
  const acquireLock = () => {
    if (!file) return { ok: true, release: () => {} };
    const lockPath = `${file}.lock`;
    try {
      makeDirectory(dirname(file), { recursive: true });
    } catch (error) {
      return { ok: false, error };
    }
    const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      try {
        const fd = openFile(lockPath, 'wx');
        try {
          writeFile(fd, `${process.pid} ${new Date().toISOString()}\n`);
        } catch {
          // The lock is the file's existence; its contents are diagnostic only.
        }
        try {
          closeFile(fd);
        } catch {
          // A close failure must not drop a lock we successfully created.
        }
        let released = false;
        return {
          ok: true,
          release: () => {
            if (released) return;
            released = true;
            try {
              removeFile(lockPath);
            } catch {
              // Another process may have reclaimed a stale lock already.
            }
          },
        };
      } catch (error) {
        if (error?.code !== 'EEXIST') return { ok: false, error };
        let stale = false;
        try {
          stale = Date.now() - statFile(lockPath).mtimeMs > lockStaleMs;
        } catch {
          // The holder released the lock between the failed open and this stat.
        }
        if (stale) {
          try {
            removeFile(lockPath);
          } catch {
            // Another waiter may have removed it first.
          }
          continue;
        }
        if (Date.now() >= deadline) return { ok: false, error };
        sleep(LOCK_RETRY_MS);
      }
    }
  };

  const snapshot = () => {
    refreshFromDisk();
    return {
      items: items.map((item) => ({ ...item })),
      revision,
      file,
      todayDate: localDateKey(),
      lastError,
    };
  };

  const ok = () => ({ ok: true, snapshot: snapshot() });

  const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

  /** Publish a new item list as one revision. */
  const commit = (next) => {
    items = next.slice(0, MAX_ITEMS);
    revision += 1;
    dirty = true;
    persist();
    return ok();
  };

  /** Find one item by id. */
  const find = (id) => (typeof id === 'string' ? items.find((item) => item.id === id) : undefined);

  /**
   * Run one mutating operation under the file lock, after reloading the latest
   * document and (when the caller supplied it) checking its base revision.
   * @param request - mutation request, optionally carrying `baseRevision`.
   * @param operation - applies the operation to the current in-memory list.
   * @returns the operation outcome.
   */
  const mutate = (request, operation) => {
    const lock = acquireLock();
    if (!lock.ok) {
      const message = lock.error?.code === 'EEXIST'
        ? 'Another process is writing the todo list. Try again.'
        : `Unable to lock the todo list: ${messageOf(lock.error)}`;
      return fail('todo_busy', message);
    }
    try {
      reloadUnderLock();
      if (request?.baseRevision !== undefined && request.baseRevision !== null) {
        const baseRevision = Number(request.baseRevision);
        if (!Number.isInteger(baseRevision) || baseRevision < 0) {
          return fail('todo_bad_request', 'baseRevision must be a non-negative integer.');
        }
        if (baseRevision !== revision) {
          return fail(
            'todo_revision_conflict',
            'The todo list changed since it was loaded. Reload and retry.',
            { snapshot: snapshot() },
          );
        }
      }
      return operation();
    } finally {
      lock.release();
    }
  };

  const add = (request) => mutate(request, () => {
    const title = normalizeTitle(request?.title);
    if (title === '') return fail('todo_title_required', 'A todo needs a non-empty title.');
    if (items.length >= MAX_ITEMS) return fail('todo_limit_reached', `The list already holds ${MAX_ITEMS} todos.`);
    const now = Date.now();
    const sessionId = normalizeSessionId(request?.sessionId);
    const today = resolveToday(request, null);
    const item = {
      id: createId(),
      title,
      done: request?.done === true,
      createdAt: now,
      updatedAt: now,
      sessionId,
      // A cached label without a link would render as a session the row cannot open.
      sessionTitle: sessionId === null ? null : normalizeSessionTitle(request?.sessionTitle),
      tags: normalizeTags(request?.tags),
      priority: normalizePriority(request?.priority),
      quadrant: normalizeQuadrant(request?.quadrant),
      todayDate: today.todayDate,
      todayAt: today.todayDate === null ? null : now,
    };
    return commit([item, ...items]);
  });

  const update = (request) => mutate(request, () => {
    const current = find(request?.id);
    if (current === undefined) return fail('todo_not_found', 'No todo matches that id.');
    const patch = {};
    if (request.title !== undefined) {
      const title = normalizeTitle(request.title);
      if (title === '') return fail('todo_title_required', 'A todo needs a non-empty title.');
      patch.title = title;
    }
    if (request.done !== undefined) patch.done = request.done === true;
    if (request.sessionId !== undefined) {
      patch.sessionId = normalizeSessionId(request.sessionId);
      patch.sessionTitle = patch.sessionId === null ? null : normalizeSessionTitle(request.sessionTitle);
    } else if (request.sessionTitle !== undefined) {
      patch.sessionTitle = normalizeSessionTitle(request.sessionTitle);
    }
    if (request.tags !== undefined) patch.tags = normalizeTags(request.tags);
    if (request.priority !== undefined) patch.priority = normalizePriority(request.priority);
    if (request.quadrant !== undefined) patch.quadrant = normalizeQuadrant(request.quadrant);
    const today = resolveToday(request, current.todayDate);
    if (today.known) {
      patch.todayDate = today.todayDate;
      patch.todayAt = today.todayDate === null
        ? null
        : current.todayDate === today.todayDate && current.todayAt !== null
          ? current.todayAt
          : Date.now();
    }
    if (Object.keys(patch).length === 0) {
      return fail('todo_nothing_to_update', 'Nothing to update: pass a field the todo carries.');
    }
    const next = { ...current, ...patch, updatedAt: Date.now() };
    return commit(items.map((item) => (item.id === next.id ? next : item)));
  });

  const remove = (request) => mutate(request, () => {
    const current = find(request?.id);
    if (current === undefined) return fail('todo_not_found', 'No todo matches that id.');
    return commit(items.filter((item) => item.id !== current.id));
  });

  const clearDone = (request) => mutate(request, () => commit(items.filter((item) => !item.done)));

  /**
   * Apply one operation. The HTTP panel API and the agent tool both route here,
   * so a mutation behaves identically for the user and for the model.
   * @param request - `{ op, ...fields }`.
   * @returns explicit success with the new snapshot, or a failure with its reason.
   */
  const apply = (request) => {
    const op = request?.op;
    switch (op) {
      case 'add':
        return add(request);
      case 'update':
        return update(request);
      case 'remove':
        return remove(request);
      case 'clearDone':
        return clearDone(request);
      case 'list':
        return ok();
      default:
        return fail('todo_unknown_op', `Unknown todo operation: ${String(op)}`);
    }
  };

  return { snapshot, apply, add, update, remove, clearDone };
}
