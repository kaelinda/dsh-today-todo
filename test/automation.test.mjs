import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTodoStore } from '../lib/store.js';
import { createAutomation, projectWorkbench } from '../lib/automation.js';
import { registerWorkbenchTools } from '../lib/workbench-tools.js';

function fixture() {
  let at = Date.parse('2026-11-01T08:00:00Z');
  const store = createTodoStore({ file: null, now: () => at, warn() {} });
  assert.equal(store.apply({ op: 'settings.update', timezone: 'UTC' }).ok, true);
  const result = store.apply({ op: 'routine.save', name: 'Daily work report', kind: 'report', reportKind: 'daily',
    frequency: 'daily', time: '09:00', timezone: 'UTC', enabled: true, mode: 'draft', projectIds: [] });
  assert.equal(result.ok, true, result.message);
  return { store, now: () => at, advance(value) { at = typeof value === 'number' ? at + value : Date.parse(value); } };
}

test('Host automation catches latest missed period once and disposes its timer', () => {
  const env = fixture();
  env.advance('2026-11-04T09:01:00Z');
  let disposed = false;
  const automation = createAutomation(env.store, { now: env.now, setInterval: () => 17, clearInterval: (id) => { assert.equal(id, 17); disposed = true; } });
  assert.equal(env.store.document().documents.length, 1);
  automation.tick();
  assert.equal(env.store.document().documents.length, 1, 'older misses must not be backfilled each tick');
  env.advance('2026-11-05T09:01:00Z');
  automation.tick();
  assert.equal(env.store.document().documents.length, 2);
  assert.equal(automation.status().state, 'running');
  automation.dispose();
  assert.equal(disposed, true);
  env.advance('2026-11-06T09:01:00Z');
  automation.tick();
  assert.equal(env.store.document().documents.length, 2);
});

test('automation exposes persistence failures, backs off, and permits manual recovery', () => {
  const env = fixture();
  env.advance('2026-11-02T09:01:00Z');
  let calls = 0;
  const broken = { document: () => env.store.document(), apply() { calls += 1; return { ok: false, code: 'todo_write_failed', message: 'Disk unavailable' }; } };
  const automation = createAutomation(broken, { now: env.now, setInterval: () => 1, clearInterval() {} });
  assert.equal(calls, 1);
  automation.tick();
  assert.equal(calls, 1, 'no busy retry');
  for (let i = 0; i < 8; i += 1) { env.advance(600_000); automation.tick(); }
  assert.equal(calls, 5, 'automatic retries are bounded');
  assert.equal(automation.status().errors[0].message, 'Disk unavailable');
  assert.equal(env.store.document().documents.length, 0);
  const rule = env.store.document().routines[0];
  assert.equal(env.store.apply({ op: 'routine.run', id: rule.id, scheduledAt: Date.parse('2026-11-02T09:00:00Z') }).ok, true);
  automation.tick();
  assert.equal(automation.status().state, 'running');
  automation.dispose();
});

test('domain tools use the same durable records and preserve independent report/review scopes', async () => {
  const store = createTodoStore({ file: null });
  const tools = new Map();
  const dispose = registerWorkbenchTools({ register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } }, store);
  const project = await tools.get('work_project').execute({ action: 'save', name: 'Project A', goal: 'Publish a useful result' });
  assert.equal(project.ok, true);
  const projectId = store.snapshot().projects[0].id;
  const log = await tools.get('work_log').execute({ action: 'add', projectId, text: 'Validated the migration with sample data', kind: 'outcome' });
  assert.equal(log.ok, true);
  const report = await tools.get('work_report').execute({ action: 'generate', kind: 'weekly', projectIds: [projectId] });
  assert.equal(report.ok, true, report.message);
  const review = await tools.get('work_review').execute({ action: 'generate', kind: 'weekly', projectIds: [] });
  assert.equal(review.ok, true, review.message);
  assert.equal((await tools.get('work_report').execute({ action: 'list' })).items.length, 1);
  assert.equal((await tools.get('work_review').execute({ action: 'list' })).items.length, 1);
  assert.equal((await tools.get('work_log').execute({ action: 'list', limit: 0 })).ok, false);
  const state = projectWorkbench(store, store.snapshot());
  assert.ok(state.insights);
  dispose();
  assert.equal(tools.size, 0);
});

test('a failed period cannot permanently disable future scheduled drafts', () => {
  const env = fixture();
  env.advance('2026-11-02T09:01:00Z');
  let writable = false;
  const store = { document: () => env.store.document(), apply(request) {
    return writable ? env.store.apply(request) : { ok: false, code: 'todo_write_failed', message: 'Temporary disk error' };
  } };
  const automation = createAutomation(store, { now: env.now, setInterval: () => 1, clearInterval() {} });
  for (let i = 0; i < 5; i += 1) { env.advance(600_000); automation.tick(); }
  assert.equal(automation.status().errors[0].attempts, 5);
  writable = true;
  env.advance('2026-11-03T09:01:00Z');
  automation.tick();
  assert.equal(env.store.document().documents.length, 1);
  assert.equal(automation.status().state, 'running');
  automation.dispose();
});
