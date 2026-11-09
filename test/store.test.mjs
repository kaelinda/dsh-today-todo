/** Storage durability, migration, lock ownership, and concurrent writers. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createTodoStore, localDateKey, versionedDataFile } from '../lib/store.js';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
async function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-todos-store-'));
  try { return await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const quietStore = (options) => createTodoStore({ warn() {}, ...options });

test('store atomically writes v3 and fsyncs the file and directory', () => withTempDir((dir) => {
  const source = join(dir, 'todos.json');
  const synced = [], directories = [];
  const store = quietStore({ file: source, syncFile: (path) => synced.push(path), syncDirectory: (path) => directories.push(path) });
  const result = store.apply({ op: 'add', title: 'Durable' });
  assert.equal(result.ok, true);
  assert.equal(synced.length, 1);
  assert.match(synced[0], /\.tmp$/);
  assert.deepEqual(directories, [dirname(source)]);
  assert.equal(result.snapshot.file, versionedDataFile(source));
  const document = JSON.parse(readFileSync(result.snapshot.file, 'utf8'));
  assert.equal(document.version, 3);
  assert.equal(document.revision, 2);
  assert.equal(document.items[0].title, 'Durable');
  assert.equal(document.events[0].taskId, document.items[0].id);
}));

test('legacy file stays byte-for-byte unchanged while migration is durable and repeatable', () => withTempDir((dir) => {
  const source = join(dir, 'todos.json');
  const raw = JSON.stringify({ version: 2, revision: 8, items: [{ id: 'legacy-1', title: 'Earlier work', done: true, createdAt: 100, updatedAt: 200, tags: ['work'], priority: 'P1', quadrant: 'q2' }] });
  writeFileSync(source, raw);
  const store = quietStore({ file: source });
  assert.equal(store.snapshot().migration.itemCount, 1);
  assert.equal(store.snapshot().items[0].completedAt, null);
  assert.equal(store.snapshot().persisted, false);
  const result = store.apply({ op: 'add', title: 'New work' });
  assert.equal(result.ok, true);
  assert.equal(readFileSync(source, 'utf8'), raw);
  assert.equal(result.snapshot.revision, 9);
  const reopened = quietStore({ file: source });
  assert.equal(reopened.snapshot().items.length, 2);
  assert.equal(reopened.document().events.filter((event) => event.type === 'imported').length, 1);
  assert.equal(reopened.document().events.some((event) => event.taskId === 'legacy-1' && event.type === 'completed'), false);
}));

test('corrupt, invalid, and future-schema documents remain untouched and block writes', () => withTempDir((dir) => {
  for (const [index, raw] of ['{ not json', '{"version":2,"notes":"hand edited"}', '{"version":99,"items":[]}'].entries()) {
    const source = join(dir, `todos-${index}.json`);
    writeFileSync(source, raw);
    const store = quietStore({ file: source });
    assert.deepEqual(store.snapshot().items, []);
    assert.equal(store.snapshot().writeBlocked, true);
    assert.equal(store.apply({ op: 'add', title: 'Must not overwrite' }).ok, false);
    assert.equal(readFileSync(source, 'utf8'), raw);
    assert.equal(readdirSync(dir).includes(`todos-${index}.v3.json`), false);
  }
}));

test('revision conflict returns the committed snapshot and does not touch disk', () => withTempDir((dir) => {
  const store = quietStore({ file: join(dir, 'todos.json') });
  store.apply({ op: 'add', title: 'first' });
  const file = store.snapshot().file;
  const before = readFileSync(file, 'utf8');
  const stale = store.apply({ op: 'add', title: 'stale', baseRevision: 1 });
  assert.equal(stale.code, 'todo_revision_conflict');
  assert.equal(stale.snapshot.revision, 2);
  assert.deepEqual(stale.snapshot.items.map((item) => item.title), ['first']);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(store.apply({ op: 'add', title: 'fresh', baseRevision: 2 }).snapshot.revision, 3);
}));

test('mutations reload under lock and snapshots see another writer', () => withTempDir((dir) => {
  const source = join(dir, 'todos.json');
  const first = quietStore({ file: source });
  const second = quietStore({ file: source });
  first.apply({ op: 'add', title: 'first' });
  second.apply({ op: 'add', title: 'second' });
  assert.deepEqual(first.snapshot().items.map((item) => item.title).sort(), ['first', 'second']);
  first.apply({ op: 'add', title: 'third' });
  assert.deepEqual(second.snapshot().items.map((item) => item.title).sort(), ['first', 'second', 'third']);
  assert.equal(second.document().events.length, 3);
}));

test('held locks report busy, stale dead locks recover, and live PID locks never expire', () => withTempDir((dir) => {
  const source = join(dir, 'todos.json');
  const lock = `${versionedDataFile(source)}.lock`;
  writeFileSync(lock, 'unknown writer');
  const busy = quietStore({ file: source, lockTimeoutMs: 30, lockStaleMs: 60000 });
  assert.equal(busy.apply({ op: 'add', title: 'blocked' }).code, 'todo_busy');
  const past = new Date(Date.now() - 60000);
  utimesSync(lock, past, past);
  const recovered = quietStore({ file: source, lockTimeoutMs: 100, lockStaleMs: 1000 });
  assert.equal(recovered.apply({ op: 'add', title: 'recovered' }).ok, true);
  writeFileSync(lock, `${process.pid} active-owner`);
  utimesSync(lock, past, past);
  const live = quietStore({ file: source, lockTimeoutMs: 30, lockStaleMs: 1000 });
  assert.equal(live.apply({ op: 'add', title: 'cannot steal' }).code, 'todo_busy');
  assert.match(readFileSync(lock, 'utf8'), /active-owner/);
}));

test('multiple processes preserve all concurrent tasks and corresponding events', async () => withTempDir(async (dir) => {
  const source = join(dir, 'todos.json');
  const workers = 4, count = 15;
  const script = `import {createTodoStore} from './lib/store.js';
    const [file,worker,count]=process.argv.slice(1); const store=createTodoStore({file,warn(){}});
    for(let i=0;i<Number(count);i++){const result=store.apply({op:'add',title:worker+'-'+i});if(!result.ok){console.error(result);process.exit(1);}}`;
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, source, `w${index}`, String(count)], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  })));
  const document = JSON.parse(readFileSync(versionedDataFile(source), 'utf8'));
  assert.equal(document.items.length, workers * count);
  assert.equal(document.events.length, workers * count);
  assert.equal(new Set(document.items.map((item) => item.title)).size, workers * count);
}));

test('memory-only store preserves Host today and does not touch a file', () => {
  const store = quietStore({ file: null });
  const result = store.apply({ op: 'add', title: 'memory', today: true });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.items[0].todayDate, localDateKey());
  assert.equal(result.snapshot.file, null);
});

test('write or fsync failure does not publish tasks, events, or a new revision', () => withTempDir((dir) => {
  const source = join(dir, 'todos.json');
  const baseline = quietStore({ file: source });
  baseline.apply({ op: 'add', title: 'committed' });
  const before = readFileSync(baseline.snapshot().file, 'utf8');
  for (const failure of [
    { writeFile: (path, ...args) => { if (typeof path === 'string' && path.endsWith('.tmp')) throw new Error('disk full'); return writeFileSync(path, ...args); } },
    { syncFile: () => { throw new Error('fsync failed'); } },
    { moveFile: () => { throw new Error('rename failed'); } },
  ]) {
    const store = quietStore({ file: source, ...failure });
    const result = store.apply({ op: 'add', title: 'uncommitted' });
    assert.equal(result.code, 'todo_persist_failed');
    assert.equal(result.snapshot.revision, 2);
    assert.deepEqual(result.snapshot.items.map((item) => item.title), ['committed']);
    assert.equal(store.document().events.length, 1);
    assert.equal(readFileSync(store.snapshot().file, 'utf8'), before);
  }
}));

test('unreadable files report an error and do not permit mutations', () => withTempDir((dir) => {
  const store = quietStore({ file: join(dir, 'todos.json'), readFile: () => { const error = new Error('permission denied'); error.code = 'EACCES'; throw error; } });
  assert.equal(store.snapshot().writeBlocked, true);
  assert.match(store.snapshot().lastError, /permission denied/);
  assert.equal(store.apply({ op: 'add', title: 'must fail' }).ok, false);
}));
