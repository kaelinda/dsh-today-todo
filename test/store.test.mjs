/**
 * Store unit tests.
 *
 * The store keeps the whole list in memory, so the interesting failures are
 * persistence, concurrency, and recovery. The filesystem seams on
 * `createTodoStore` exist exactly so those paths can be asserted without
 * mocking Node's fs module globally.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  fstatSync,
  fsyncSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { createTodoStore, localDateKey } from '../lib/store.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** One temporary directory per test, removed even when an assertion fails. */
async function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-store-'));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A store that does not write warnings to the test output. */
function quietStore(options) {
  return createTodoStore({ warn: () => {}, ...options });
}

test('store writes atomically and fsyncs the temp file and its directory', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const synced = [];
  const directories = [];
  const store = quietStore({
    file,
    syncFile: (path) => synced.push(path),
    syncDirectory: (path) => directories.push(path),
  });

  const outcome = store.apply({ op: 'add', title: 'Durable' });
  assert.equal(outcome.ok, true);
  assert.equal(synced.length, 1);
  assert.match(synced[0], /\.tmp$/);
  assert.deepEqual(directories, [dirname(file)]);

  const document = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(document.version, 2);
  assert.equal(document.revision, 2);
  assert.equal(document.items[0].title, 'Durable');
}));

test('corrupt document is only moved aside under a mutation lock, not by reads', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  writeFileSync(file, '{ not json', 'utf8');
  const warnings = [];
  const store = createTodoStore({ file, warn: (message) => warnings.push(message) });

  assert.deepEqual(store.snapshot().items, []);
  assert.equal(readFileSync(file, 'utf8'), '{ not json');
  assert.equal(readdirSync(dir).some((name) => name.includes('.corrupt-')), false);

  const outcome = store.apply({ op: 'add', title: 'Recovered' });
  assert.equal(outcome.ok, true);
  assert.equal(warnings.some((message) => /corrupt todo document moved to/.test(message)), true);
  const backups = readdirSync(dir).filter((name) => name.includes('.corrupt-'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(dir, backups[0]), 'utf8'), '{ not json');

  assert.equal(JSON.parse(readFileSync(file, 'utf8')).items[0].title, 'Recovered');
}));

test('a document without an items array is treated as corrupt', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  writeFileSync(file, '{"version":2,"notes":"hand edited"}', 'utf8');
  const warnings = [];
  const store = createTodoStore({ file, warn: (message) => warnings.push(message) });
  assert.deepEqual(store.snapshot().items, []);
  assert.equal(store.apply({ op: 'add', title: 'Recovered' }).ok, true);
  assert.equal(readdirSync(dir).some((name) => name.includes('.corrupt-')), true);
  assert.equal(warnings.some((message) => /no items array/.test(message)), true);
}));

test('revision conflict returns the current snapshot and does not mutate', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const store = quietStore({ file });
  const added = store.apply({ op: 'add', title: 'first' });
  const before = readFileSync(file, 'utf8');

  const stale = store.apply({ op: 'add', title: 'stale', baseRevision: 1 });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'todo_revision_conflict');
  assert.equal(stale.snapshot.revision, 2);
  assert.deepEqual(stale.snapshot.items.map((item) => item.title), ['first']);
  assert.equal(readFileSync(file, 'utf8'), before, 'the stale write touched the file');

  const fresh = store.apply({ op: 'add', title: 'fresh', baseRevision: 2 });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.snapshot.revision, 3);
}));

test('an external writer is preserved because a mutation re-reads under the lock', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const first = quietStore({ file });
  const added = first.apply({ op: 'add', title: 'from first' });
  assert.equal(added.ok, true);

  // Simulate a second process that wrote a new item and a newer revision
  // without going through this store instance.
  const document = JSON.parse(readFileSync(file, 'utf8'));
  document.revision += 1;
  document.items.unshift({
    ...document.items[0],
    id: 'todo-external',
    title: 'from second process',
    createdAt: Date.now() + 1,
  });
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const outcome = first.apply({
    op: 'add',
    title: 'from first again',
    baseRevision: first.snapshot().revision,
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(
    outcome.snapshot.items.map((item) => item.title).sort(),
    ['from first', 'from first again', 'from second process'],
  );
}));

test('snapshot picks up an external write made after the store loaded', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const store = quietStore({ file });
  store.apply({ op: 'add', title: 'initial' });

  const document = JSON.parse(readFileSync(file, 'utf8'));
  document.revision += 1;
  document.items.unshift({ ...document.items[0], id: 'todo-other', title: 'written elsewhere' });
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const snapshot = store.snapshot();
  assert.equal(snapshot.revision, 3);
  assert.deepEqual(snapshot.items.map((item) => item.title), ['written elsewhere', 'initial']);
}));

test('a held lock reports busy, and a stale lock is reclaimed', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const lock = `${file}.lock`;
  writeFileSync(lock, 'held by another process', 'utf8');

  const busy = quietStore({ file, lockTimeoutMs: 30, lockStaleMs: 60_000 });
  const outcome = busy.apply({ op: 'add', title: 'blocked' });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, 'todo_busy');

  // Age the lock past the stale threshold: a crashed writer must not wedge the
  // store forever.
  const longAgo = new Date(Date.now() - 60_000);
  utimesSync(lock, longAgo, longAgo);
  const recovered = quietStore({ file, lockTimeoutMs: 100, lockStaleMs: 1000 });
  const added = recovered.apply({ op: 'add', title: 'after stale lock' });
  assert.equal(added.ok, true);
  assert.equal(added.snapshot.items[0].title, 'after stale lock');
}));

test('multiple processes adding concurrently keep every item', async () => withTempDir(async (dir) => {
  const file = join(dir, 'todos.json');
  const workers = 4;
  const perWorker = 15;
  const script = `
    import { createTodoStore } from './lib/store.js';
    const [file, worker, count] = process.argv.slice(1);
    const store = createTodoStore({ file, warn() {} });
    for (let i = 0; i < Number(count); i += 1) {
      const outcome = store.apply({ op: 'add', title: worker + '-' + i });
      if (!outcome.ok) {
        console.error(outcome.code, outcome.message);
        process.exit(1);
      }
    }
  `;
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, file, `w${index}`, String(perWorker)], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`worker ${index} exited ${code}: ${stderr}`));
    });
  })));

  const document = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(document.items.length, workers * perWorker);
  assert.equal(new Set(document.items.map((item) => item.title)).size, workers * perWorker);
  assert.ok(document.revision >= workers * perWorker + 1);
}));

test('store without a file still works in memory', () => {
  const store = quietStore({ file: null });
  const outcome = store.apply({ op: 'add', title: 'memory only', today: true });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.snapshot.items[0].todayDate, localDateKey());
  assert.equal(outcome.snapshot.file, null);
});

test('an unreadable document degrades to empty with a warning', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const warnings = [];
  const store = createTodoStore({
    file,
    readFile: () => {
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    },
    warn: (message) => warnings.push(message),
  });
  assert.deepEqual(store.snapshot().items, []);
  assert.match(store.snapshot().lastError, /permission denied/);
  assert.equal(warnings.length, 1);
}));

for (const failure of ['write', 'fsync', 'rename']) {
  test(`a ${failure} failure rejects the mutation without publishing items or revision`, () => withTempDir((dir) => {
    const file = join(dir, 'todos.json');
    const seed = quietStore({ file }).add({ title: 'Committed' });
    const before = readFileSync(file, 'utf8');
    const fail = () => { throw new Error(`${failure} failed`); };
    const store = quietStore({
      file,
      ...(failure === 'write' ? { writeFile: (path, ...args) => typeof path === 'string' ? fail() : writeFileSync(path, ...args) } : {}),
      ...(failure === 'fsync' ? { syncFile: fail } : {}),
      ...(failure === 'rename' ? { moveFile: fail } : {}),
    });
    const result = store.add({ title: 'Not saved' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'todo_persistence_failed');
    assert.equal(result.snapshot.revision, seed.snapshot.revision);
    assert.deepEqual(result.snapshot.items, seed.snapshot.items);
    assert.match(result.snapshot.lastError, /failed/);
    assert.equal(readFileSync(file, 'utf8'), before);
    assert.deepEqual(readdirSync(dir), ['todos.json'], 'failed writes must clean up their lock and temporary file');
  }));
}

test('failed update, removal and clearDone retain the committed state', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const seed = quietStore({ file }).add({ title: 'Keep this', done: true });
  const store = quietStore({ file, syncFile: () => { throw new Error('disk unavailable'); } });
  for (const request of [
    { op: 'update', id: seed.snapshot.items[0].id, title: 'Changed' },
    { op: 'remove', id: seed.snapshot.items[0].id },
    { op: 'clearDone' },
  ]) {
    const result = store.apply(request);
    assert.equal(result.ok, false);
    assert.deepEqual(result.snapshot.items, seed.snapshot.items);
    assert.equal(result.snapshot.revision, seed.snapshot.revision);
  }
}));

test('retry after a failed save preserves another instance\'s committed changes', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  let unavailable = true;
  const first = quietStore({
    file,
    moveFile: (...args) => {
      if (unavailable) throw new Error('temporary outage');
      return renameSync(...args);
    },
  });
  const failed = first.add({ title: 'Retry me', baseRevision: 1 });
  assert.equal(failed.ok, false);
  const second = quietStore({ file });
  const saved = second.add({ title: 'Other instance' });
  assert.equal(saved.ok, true);
  unavailable = false;
  const stale = first.add({ title: 'Retry me', baseRevision: failed.snapshot.revision });
  assert.equal(stale.code, 'todo_revision_conflict');
  assert.deepEqual(stale.snapshot.items.map((item) => item.title), ['Other instance']);
  const retried = first.add({ title: 'Retry me', baseRevision: stale.snapshot.revision });
  assert.equal(retried.ok, true);
  assert.equal(retried.snapshot.lastError, null);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).items.map((item) => item.title), ['Retry me', 'Other instance']);
}));

test('unreadable storage blocks mutations instead of overwriting data with an empty list', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  quietStore({ file }).add({ title: 'Must survive' });
  const before = readFileSync(file, 'utf8');
  const store = quietStore({ file, readFile: () => { throw new Error('permission denied'); } });
  const result = store.add({ title: 'Cannot safely add' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'todo_storage_unavailable');
  assert.equal(readFileSync(file, 'utf8'), before);
}));

test('failed corrupt backup blocks writes and leaves the original recoverable', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  writeFileSync(file, '{ recoverable data');
  const store = quietStore({ file, moveFile: () => { throw new Error('backup denied'); } });
  const result = store.add({ title: 'Cannot safely add' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'todo_storage_unavailable');
  assert.equal(readFileSync(file, 'utf8'), '{ recoverable data');
  assert.deepEqual(readdirSync(dir), ['todos.json']);
}));

test('directory sync failure after rename does not invite duplicate retries', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const store = quietStore({ file, syncDirectory: () => { throw new Error('unsupported'); } });
  const result = store.add({ title: 'Already saved' });
  assert.equal(result.ok, true);
  assert.match(result.snapshot.lastError, /directory sync failed/);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).items[0].title, 'Already saved');
}));

test('the default directory sync helper surfaces unsupported fsync as a saved warning', () => withTempDir((dir) => {
  const file = join(dir, 'todos.json');
  const store = quietStore({
    file,
    fsync: (fd) => {
      if (fstatSync(fd).isDirectory()) throw new Error('directory fsync unsupported');
      fsyncSync(fd);
    },
  });
  const result = store.add({ title: 'Saved with warning' });
  assert.equal(result.ok, true);
  assert.match(result.snapshot.lastError, /directory sync failed.*unsupported/);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).items[0].title, 'Saved with warning');
}));

test('snapshot tag arrays cannot mutate the store without committing', () => {
  const store = quietStore({ file: null });
  const result = store.add({ title: 'Immutable snapshot', tags: ['original'] });
  result.snapshot.items[0].tags.push('unsaved');
  assert.deepEqual(store.snapshot().items[0].tags, ['original']);
});
