/**
 * Durable todo storage for the `dsh-todos` bundle.
 *
 * One JSON document under the DSH home keeps the list independent of any single
 * Session or browser profile, so the panel and the agent tool read and write the
 * same items. Writes are atomic (temporary file + rename) and a missing or
 * unreadable document degrades to an empty list instead of failing activation.
 *
 * Each item carries optional planning detail besides its title:
 * - `tags` — free-form module/category labels (at most {@link MAX_TAGS}).
 * - `priority` — one of `P0`–`P3`, or null when not ranked.
 * - `quadrant` — Eisenhower classification `q1`–`q4`, or null when unset.
 * - `todayDate` — the local day the item was put into the "today" focus list, so
 *   the focus list resets on its own each day while the record keeps its date.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
/** Priority levels, most urgent first. */
export const PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
/** Eisenhower quadrants: important/urgent, important/not, urgent/not, neither. */
export const QUADRANTS = Object.freeze(['q1', 'q2', 'q3', 'q4']);

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
 * Read the document. Every failure (missing file, bad JSON, wrong shape) yields
 * an empty list, because losing the panel is worse than losing one stale file.
 * @param file - document path.
 * @param readFile - reader injection for tests.
 * @returns stored items, most recently created first.
 */
function readDocument(file, readFile) {
  if (!file) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFile(file, 'utf8'));
  } catch {
    return [];
  }
  const raw = parsed?.items;
  if (!Array.isArray(raw)) return [];
  const items = [];
  for (const entry of raw) {
    const item = normalizeStoredItem(entry);
    if (item !== null) items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

/**
 * Create the todo store shared by the HTTP panel API and the agent tool.
 * @param options - optional document path plus filesystem injections for tests.
 */
export function createTodoStore(options = {}) {
  const file = options.file === undefined ? defaultDataFile(options.env ?? process.env) : options.file;
  const readFile = options.readFile ?? readFileSync;
  const writeFile = options.writeFile ?? writeFileSync;
  const moveFile = options.moveFile ?? renameSync;
  const makeDirectory = options.makeDirectory ?? mkdirSync;
  const warn = options.warn ?? ((message) => console.warn(`[dsh-todos] ${message}`));

  let items = readDocument(file, readFile);
  let revision = 1;
  let lastError = null;

  /** Write the whole document; a failure is reported but never thrown at a caller. */
  const persist = () => {
    if (!file) return;
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      makeDirectory(dirname(file), { recursive: true });
      writeFile(temporary, `${JSON.stringify({ version: DOCUMENT_VERSION, items }, null, 2)}\n`, 'utf8');
      moveFile(temporary, file);
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      warn(`unable to save todos: ${lastError}`);
    }
  };

  const snapshot = () => ({ items: items.map((item) => ({ ...item })), revision, file, lastError });

  const ok = () => ({ ok: true, snapshot: snapshot() });

  const fail = (code, message) => ({ ok: false, code, message });

  /** Publish a new item list as one revision. */
  const commit = (next) => {
    items = next.slice(0, MAX_ITEMS);
    revision += 1;
    persist();
    return ok();
  };

  /** Find one item by id. */
  const find = (id) => (typeof id === 'string' ? items.find((item) => item.id === id) : undefined);

  const add = (request) => {
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
  };

  const update = (request) => {
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
  };

  const remove = (request) => {
    const current = find(request?.id);
    if (current === undefined) return fail('todo_not_found', 'No todo matches that id.');
    return commit(items.filter((item) => item.id !== current.id));
  };

  const clearDone = () => commit(items.filter((item) => !item.done));

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
        return clearDone();
      case 'list':
        return ok();
      default:
        return fail('todo_unknown_op', `Unknown todo operation: ${String(op)}`);
    }
  };

  return { snapshot, apply, add, update, remove, clearDone };
}
