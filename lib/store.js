/**
 * Transactional local workbench storage. v2 files remain untouched; v3 uses a
 * sibling file. A failed write never publishes its in-memory draft or revision.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { applyInsightOperation } from './insights.js';
import { applyWorkOperation, clone, COLLECTIONS, dateKey, emptyDocument, invalid, migrateTask, recordTaskEvent } from './workbench-store.js';
export { PRIORITIES, QUADRANTS, normalizeTags, normalizePriority, normalizeQuadrant, normalizeTodayDate } from './workbench-store.js';

const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms) => Atomics.wait(SLEEP_BUFFER, 0, 0, ms);
const messageOf = (error) => error instanceof Error ? error.message : String(error);
export function defaultDataFile(env = process.env) {
  if (typeof env.DSH_TODOS_FILE === 'string' && env.DSH_TODOS_FILE) return env.DSH_TODOS_FILE;
  return join(env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-todos', 'todos.json');
}
export function localDateKey(date = new Date()) { return dateKey(date.getTime()); }
export function versionedDataFile(file) {
  if (file === null || /\.v3\.json$/.test(file)) return file;
  return file.endsWith('.json') ? `${file.slice(0, -5)}.v3.json` : `${file}.v3.json`;
}

/** Preserve all fields and reject documents that could otherwise lose history. */
function parseDocument(raw, sourceFile, at) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { invalid(`Invalid JSON: ${messageOf(error)}`, 'todo_invalid_document'); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) invalid('Document has no items array.', 'todo_invalid_document');
  const version = parsed.version ?? 1;
  if (![1, 2, 3].includes(version)) invalid(`Unsupported document version ${String(version)}; refusing to overwrite it.`, 'todo_unsupported_version');
  if (version === 3) {
    for (const key of COLLECTIONS) if (!Array.isArray(parsed[key])) invalid(`v3 document has no ${key} array.`, 'todo_invalid_document');
    if (!parsed.settings || typeof parsed.settings !== 'object') invalid('v3 document has no settings.', 'todo_invalid_document');
    if (!Number.isInteger(parsed.revision) || parsed.revision < 1) invalid('v3 document has an invalid revision.', 'todo_invalid_document');
    const seen = new Set();
    for (const item of parsed.items) {
      if (!item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || seen.has(item.id)) invalid('v3 document contains an invalid or duplicate task.', 'todo_invalid_document');
      seen.add(item.id);
    }
    try { dateKey(at, parsed.settings.timezone); } catch { invalid('v3 document has an invalid time zone.', 'todo_invalid_document'); }
    return parsed;
  }
  const document = emptyDocument();
  document.revision = Math.max(1, Number.isInteger(parsed.revision) ? parsed.revision : 1);
  document.items = parsed.items.map((item) => migrateTask(item, at));
  if (new Set(document.items.map((item) => item.id)).size !== document.items.length) invalid('Legacy document contains duplicate task IDs.', 'todo_invalid_document');
  document.migration = {
    sourceFile, sourceVersion: version, sourceRevision: parsed.revision ?? null,
    sourceSha256: createHash('sha256').update(raw).digest('hex'), itemCount: document.items.length, importedAt: at,
  };
  for (const item of document.items) recordTaskEvent(document, 'imported', null, item, at, 'migration');
  return document;
}

export function createTodoStore(options = {}) {
  const configuredFile = options.file === undefined ? defaultDataFile(options.env ?? process.env) : options.file;
  const file = versionedDataFile(configuredFile);
  const legacyFile = configuredFile === file ? null : configuredFile;
  const readFile = options.readFile ?? readFileSync;
  const writeFile = options.writeFile ?? writeFileSync;
  const moveFile = options.moveFile ?? renameSync;
  const makeDirectory = options.makeDirectory ?? mkdirSync;
  const removeFile = options.removeFile ?? unlinkSync;
  const statFile = options.statFile ?? statSync;
  const openFile = options.openFile ?? openSync;
  const closeFile = options.closeFile ?? closeSync;
  const fsync = options.fsync ?? fsyncSync;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const warn = options.warn ?? ((message) => console.warn(`[dsh-todos] ${message}`));
  const lockTimeoutMs = options.lockTimeoutMs ?? 2000;
  const lockStaleMs = options.lockStaleMs ?? 10000;
  const syncFile = options.syncFile ?? ((path) => {
    const fd = openFile(path, 'r');
    try { fsync(fd); } finally { closeFile(fd); }
  });
  const syncDirectory = options.syncDirectory ?? ((path) => {
    let fd;
    try { fd = openFile(path, 'r'); fsync(fd); }
    catch { /* Directory fsync is best effort on platforms that do not support it. */ }
    finally { if (fd !== undefined) try { closeFile(fd); } catch { /* Best effort close. */ } }
  });
  let document = emptyDocument();
  let lastError = null;
  let blockedCode = null;
  let persisted = false;
  let signature = null;
  let initialized = false;

  const read = (path) => {
    if (!path) return null;
    try { return readFile(path, 'utf8'); }
    catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  };
  const stamp = () => {
    if (!file) return null;
    try { const value = statFile(file); return `${value.mtimeMs}:${value.size}:${value.ino ?? ''}`; }
    catch { return null; }
  };
  const reload = (force = false) => {
    if (!file) return true;
    const currentSignature = stamp();
    if (!force && initialized && currentSignature !== null && currentSignature === signature && !blockedCode) return true;
    try {
      const raw = read(file);
      if (raw !== null) {
        const next = parseDocument(raw, file, now());
        // A v2 document at an explicitly selected v3 path is not a safe migration.
        if (JSON.parse(raw).version !== 3) invalid('The v3 target contains an older schema. Choose its original legacy path to migrate.', 'todo_invalid_document');
        document = next;
        persisted = true;
      } else {
        if (persisted) invalid('The committed v3 data file disappeared; restore it before writing.', 'todo_storage_unavailable');
        const legacy = read(legacyFile);
        document = legacy === null ? emptyDocument() : parseDocument(legacy, legacyFile, now());
        if (legacy !== null && JSON.parse(legacy).version === 3) invalid('A v3 document must use an explicit .v3.json path.', 'todo_invalid_document');
      }
      signature = currentSignature;
      blockedCode = null;
      lastError = null;
      initialized = true;
      return true;
    } catch (error) {
      const message = `Unable to read workbench: ${messageOf(error)}`;
      if (lastError !== message) warn(message);
      lastError = message;
      blockedCode = error.code?.startsWith('todo_') ? error.code : 'todo_storage_unavailable';
      initialized = true;
      return false;
    }
  };
  reload(true);

  const compactDocument = (entry) => {
    const result = clone(entry);
    delete result.facts;
    delete result.factSnapshot;
    delete result.history;
    if (Array.isArray(result.revisions)) result.revisions = result.revisions.map(({ content, facts, ...metadata }) => metadata);
    return result;
  };
  const projectSnapshot = () => {
    const at = now();
    return {
      version: 3, revision: document.revision, file, legacyFile, lastError, writeBlocked: blockedCode !== null,
      persisted: file === null || persisted, todayDate: dateKey(at, document.settings.timezone),
      items: clone(document.items.filter((item) => !item.archivedAt && !item.deletedAt)),
      archivedItems: clone(document.items.filter((item) => item.archivedAt || item.deletedAt)),
      projects: clone(document.projects), logs: clone(document.logs.slice(-100).reverse()),
      plans: clone(document.plans.map(({ history, ...entry }) => entry)),
      focusSessions: clone(document.focusSessions.slice(-100)), settings: clone(document.settings),
      routines: clone(document.routines), runs: clone(document.runs.slice(-100)), documents: document.documents.map(compactDocument),
      migration: document.migration ? clone(document.migration) : null,
      counts: Object.fromEntries(COLLECTIONS.map((key) => [key, document[key].length])),
    };
  };
  const snapshot = () => { reload(); return projectSnapshot(); };
  const fullDocument = () => { reload(); return clone(document); };
  const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

  const acquireLock = () => {
    if (!file) return () => {};
    makeDirectory(dirname(file), { recursive: true });
    const lockPath = `${file}.lock`;
    const token = `${process.pid} ${randomUUID()} ${Date.now()}`;
    const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      try {
        const fd = openFile(lockPath, 'wx');
        try { writeFile(fd, token); }
        catch (error) { try { removeFile(lockPath); } catch {} throw error; }
        finally { closeFile(fd); }
        return () => {
          try { if (readFile(lockPath, 'utf8') === token) removeFile(lockPath); }
          catch { /* Already removed or replaced; do not remove another writer's lock. */ }
        };
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const lockStat = statFile(lockPath);
          const owner = readFile(lockPath, 'utf8');
          const pid = Number(String(owner).split(' ')[0]);
          let alive = false;
          if (Number.isInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); alive = true; } catch (probe) { alive = probe.code !== 'ESRCH'; }
          }
          // Never reclaim a live process merely because a large write took >10s.
          if (!alive && Date.now() - lockStat.mtimeMs > lockStaleMs && readFile(lockPath, 'utf8') === owner) removeFile(lockPath);
        } catch { /* Holder may have released between open and read. */ }
        if (Date.now() >= deadline) invalid('Another process is writing the workbench. Try again.', 'todo_busy');
        sleep(15);
      }
    }
  };
  const persist = (next) => {
    if (!file) return;
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      syncFile(temporary);
      moveFile(temporary, file);
    } catch (error) {
      try { removeFile(temporary); } catch { /* It may never have been created. */ }
      throw error;
    }
    try { syncDirectory(dirname(file)); } catch (error) { warn(`Directory fsync failed after atomic rename: ${messageOf(error)}`); }
    persisted = true;
    signature = stamp();
  };
  const query = (request) => {
    if (!COLLECTIONS.includes(request.collection)) return fail('todo_bad_request', 'Unknown history collection.');
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 50;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) return fail('todo_bad_request', 'offset must be non-negative; limit must be 1–200.');
    let records = document[request.collection];
    if (request.id !== undefined) records = records.filter((entry) => entry.id === request.id);
    if (request.taskId !== undefined) records = records.filter((entry) => entry.taskId === request.taskId);
    if (request.projectId !== undefined) records = records.filter((entry) => entry.projectId === request.projectId);
    const total = records.length;
    return { ok: true, snapshot: projectSnapshot(), data: { records: clone(records.slice(offset, offset + limit)), offset, limit, total, hasMore: offset + limit < total } };
  };
  const apply = (request) => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) return fail('todo_bad_request', 'Expected an operation object.');
    if (request.op === 'list' || request.op === 'query') {
      reload();
      return request.op === 'list' ? { ok: true, snapshot: projectSnapshot() } : query(request);
    }
    let release;
    try {
      release = acquireLock();
      if (!reload(true)) return fail(blockedCode, lastError);
      if (request.baseRevision !== undefined && request.baseRevision !== null) {
        if (!Number.isInteger(request.baseRevision) || request.baseRevision < 0) return fail('todo_bad_request', 'baseRevision must be a non-negative integer.');
        if (request.baseRevision !== document.revision) return fail('todo_revision_conflict', 'The workbench changed since it was loaded. Reload and retry.', { snapshot: projectSnapshot() });
      }
      const next = clone(document);
      const context = { now: now() };
      const result = applyWorkOperation(next, request, context) ?? applyInsightOperation(next, request, context);
      if (!result) return fail('todo_unknown_op', `Unknown todo operation: ${String(request.op)}`);
      if (result.changed) {
        next.revision = document.revision + 1;
        try { persist(next); }
        catch (error) {
          lastError = `Unable to save workbench: ${messageOf(error)}`;
          warn(lastError);
          return fail('todo_persist_failed', lastError, { snapshot: projectSnapshot() });
        }
        document = next;
        lastError = null;
      }
      return { ok: true, snapshot: projectSnapshot(), ...(result.data === undefined ? {} : { data: clone(result.data) }) };
    } catch (error) {
      const code = error.code?.startsWith('todo_') ? error.code
        : ['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'EIO', 'ENOENT', 'EMFILE', 'ENFILE'].includes(error.code) ? 'todo_storage_unavailable' : 'todo_bad_request';
      return fail(code, messageOf(error));
    } finally { release?.(); }
  };
  return {
    snapshot, document: fullDocument, apply,
    add: (request) => apply({ ...request, op: 'add' }), update: (request) => apply({ ...request, op: 'update' }),
    remove: (request) => apply({ ...request, op: 'remove' }), clearDone: (request) => apply({ ...request, op: 'clearDone' }),
  };
}
