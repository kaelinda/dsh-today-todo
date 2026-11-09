/** Meaningful domain cases: immutable history, commitment, and input boundaries. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTodoStore, versionedDataFile } from '../lib/store.js';

function setup() {
  let at = Date.parse('2026-11-09T01:00:00Z');
  const store = createTodoStore({ file: null, now: () => at, warn() {} });
  const apply = (request) => { const result = store.apply(request); assert.equal(result.ok, true, JSON.stringify(result)); return result; };
  return { store, apply, tick: (minutes = 1) => { at += minutes * 60000; }, now: () => at };
}

test('completion, reopening, renaming, and archiving preserve accurate events', () => {
  const { store, apply, tick, now } = setup();
  const id = apply({ op: 'add', title: 'Deliver work' }).data.item.id;
  tick();
  apply({ op: 'update', id, done: true });
  const firstCompletion = now();
  tick();
  apply({ op: 'update', id, title: 'Renamed result' });
  assert.equal(store.snapshot().items[0].completedAt, firstCompletion);
  tick();
  apply({ op: 'update', id, done: false });
  assert.equal(store.snapshot().items[0].completedAt, null);
  tick();
  apply({ op: 'update', id, status: 'done' });
  apply({ op: 'clearDone' });
  assert.equal(store.snapshot().items.length, 0);
  assert.equal(store.snapshot().archivedItems.length, 1);
  assert.deepEqual(store.document().events.map((entry) => entry.type), ['created', 'completed', 'updated', 'reopened', 'completed', 'archived']);
  apply({ op: 'restore', id });
  assert.equal(store.snapshot().items[0].done, true);
  apply({ op: 'remove', id });
  assert.equal(store.snapshot().items.length, 0);
  assert.ok(store.document().items[0].deletedAt);
  apply({ op: 'restore', id });
  assert.equal(store.snapshot().items[0].id, id);
});

test('progress preserves the project and tags at occurrence time after a task moves', () => {
  const { store, apply, tick, now } = setup();
  const a = apply({ op: 'project.save', name: 'A' }).data.project.id;
  const b = apply({ op: 'project.save', name: 'B' }).data.project.id;
  const id = apply({ op: 'add', title: 'Research', projectId: a, tags: ['study'] }).data.item.id;
  const occurrence = now();
  tick();
  apply({ op: 'update', id, projectId: b, tags: ['build'] });
  apply({ op: 'log.add', taskId: id, time: occurrence, text: 'Found the key result' });
  assert.equal(store.document().logs[0].projectId, a);
  assert.deepEqual(store.document().logs[0].tags, ['study']);
  apply({ op: 'log.add', taskId: id, text: 'Started implementation' });
  assert.equal(store.document().logs[1].projectId, b);
  assert.equal(store.apply({ op: 'log.add', taskId: id, projectId: a, text: 'Incorrect ownership' }).ok, false);
});

test('first confirmed plan baseline survives later additions and withdrawals', () => {
  const { store, apply, tick, now } = setup();
  const a = apply({ op: 'add', title: 'Initial commitment', estimateMinutes: 60 }).data.item.id;
  const b = apply({ op: 'add', title: 'Interruption' }).data.item.id;
  apply({ op: 'plan.save', period: 'day', date: '2026-11-09', taskIds: [a], commit: false });
  assert.equal(store.snapshot().plans[0].committedAt, null);
  tick();
  apply({ op: 'plan.save', period: 'day', date: '2026-11-09', taskIds: [a], commit: true });
  const committedAt = now();
  tick();
  apply({ op: 'plan.save', period: 'day', date: '2026-11-09', taskIds: [b], commit: true });
  const plan = store.document().plans[0];
  assert.equal(store.document().plans.length, 1);
  assert.equal(plan.committedAt, committedAt);
  assert.deepEqual(plan.baselineTaskIds, [a]);
  assert.deepEqual(plan.taskIds, [b]);
  assert.equal(plan.history.length, 3);
});

test('confirming a daily plan atomically schedules its tasks and preserves task states', () => {
  const { store, apply, tick, now } = setup();
  apply({ op: 'settings.update', timezone: 'America/Los_Angeles' });
  const day = store.snapshot().todayDate;
  assert.equal(day, '2026-11-08');
  const first = apply({ op: 'add', title: 'Waiting for review', status: 'waiting' }).data.item.id;
  const second = apply({ op: 'add', title: 'Start research' }).data.item.id;
  apply({ op: 'plan.save', period: 'day', date: day, title: 'Ship a reviewable result', taskIds: [first], commit: false });
  assert.equal(store.document().items.find((item) => item.id === first).plannedDate, null);
  tick();
  const confirmedAt = now();
  const committed = apply({ op: 'plan.save', period: 'day', date: day, taskIds: [first], commit: true });
  let item = committed.snapshot.items.find((entry) => entry.id === first);
  assert.equal(item.plannedDate, day);
  assert.equal(item.todayDate, day);
  assert.equal(item.todayAt, confirmedAt);
  assert.equal(item.status, 'waiting');
  assert.equal(committed.data.plan.history.at(-1).title, 'Ship a reviewable result');
  assert.equal(committed.data.plan.baselineTasks[0].plannedDate, day);
  tick();
  apply({ op: 'plan.save', period: 'day', date: day, taskIds: [second] });
  const document = store.document();
  item = document.items.find((entry) => entry.id === first);
  assert.equal(item.plannedDate, null);
  assert.equal(item.todayDate, null);
  assert.equal(item.todayAt, null);
  assert.equal(item.status, 'waiting');
  assert.equal(document.items.find((entry) => entry.id === second).todayDate, day);
  assert.deepEqual(document.plans[0].baselineTaskIds, [first]);
  assert.deepEqual(document.plans[0].taskIds, [second]);
  assert.equal(document.events.filter((event) => event.type === 'planned').length, 3);
  assert.ok(document.events.filter((event) => event.type === 'planned').every((event) => event.planId === document.plans[0].id));
});

test('removing a plan task retains independent rescheduling and weekly plans do not move dates', () => {
  const { store, apply } = setup();
  const day = store.snapshot().todayDate;
  const id = apply({ op: 'add', title: 'Already scheduled', plannedDate: '2026-11-12', todayDate: '2026-11-10' }).data.item.id;
  apply({ op: 'plan.save', period: 'week', date: day, taskIds: [id], commit: true });
  assert.equal(store.snapshot().items[0].plannedDate, '2026-11-12');
  assert.equal(store.snapshot().items[0].todayDate, '2026-11-10');
  apply({ op: 'plan.save', period: 'day', date: day, taskIds: [id], commit: true });
  apply({ op: 'update', id, plannedDate: '2026-11-13', todayDate: '2026-11-11' });
  apply({ op: 'plan.save', period: 'day', date: day, taskIds: [] });
  assert.equal(store.snapshot().items[0].plannedDate, '2026-11-13');
  assert.equal(store.snapshot().items[0].todayDate, '2026-11-11');
  const previousEvents = store.document().events.length;
  apply({ op: 'plan.save', period: 'day', date: '2026-11-14', taskIds: [id], commit: false });
  assert.equal(store.snapshot().items[0].plannedDate, '2026-11-13');
  assert.equal(store.document().events.length, previousEvents);
});

test('a failed daily-plan write publishes neither its plan nor task-date events', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-workbench-plan-failure-'));
  try {
    const source = join(dir, 'todos.json');
    const baseline = createTodoStore({ file: source, warn() {} });
    const added = baseline.apply({ op: 'add', title: 'Keep the old state' });
    const before = readFileSync(added.snapshot.file, 'utf8');
    const store = createTodoStore({ file: source, warn() {}, moveFile() { throw new Error('disk unavailable'); } });
    const result = store.apply({ op: 'plan.save', period: 'day', date: store.snapshot().todayDate, taskIds: [added.data.item.id], commit: true });
    assert.equal(result.code, 'todo_persist_failed');
    assert.equal(store.document().plans.length, 0);
    assert.equal(store.document().events.length, 1);
    assert.equal(store.document().items[0].plannedDate, null);
    assert.equal(store.document().items[0].todayDate, null);
    assert.equal(readFileSync(added.snapshot.file, 'utf8'), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('focus records are idempotent, exclude pauses, and reject overlap', () => {
  const { store, apply, tick, now } = setup();
  const id = apply({ op: 'add', title: 'Focus' }).data.item.id;
  const startedAt = now();
  tick(30);
  const request = { op: 'focus.record', clientId: 'timer-round-1', taskId: id, startedAt, endedAt: now(), pauseMinutes: 5 };
  assert.equal(apply(request).data.focusSession.minutes, 25);
  assert.equal(apply(request).data.duplicate, true);
  assert.equal(store.document().focusSessions.length, 1);
  assert.equal(store.apply({ ...request, clientId: 'different', minutes: 25 }).code, 'todo_time_overlap');
  assert.equal(store.apply({ ...request, clientId: 'bad', minutes: 30 }).ok, false);
});

test('focus already running when its task is deleted can finish and retry, but cannot restart afterward', () => {
  const { store, apply, tick, now } = setup();
  const project = apply({ op: 'project.save', name: 'Prior context' }).data.project.id;
  const id = apply({ op: 'add', title: 'Work in progress', projectId: project }).data.item.id;
  const startedAt = now();
  tick(5);
  const deletedAt = now();
  apply({ op: 'remove', id });
  tick(20);
  const request = { op: 'focus.record', clientId: 'deleted-task-round', taskId: id, startedAt, endedAt: now() };
  const saved = apply(request);
  assert.equal(saved.data.focusSession.minutes, 25);
  assert.equal(saved.data.focusSession.projectId, project);
  assert.equal(apply(request).data.duplicate, true);
  assert.equal(store.document().focusSessions.length, 1);
  assert.equal(store.snapshot().items.length, 0);
  assert.equal(store.apply({ ...request, clientId: 'new-after-delete', startedAt: deletedAt }).ok, false);
  assert.equal(store.document().focusSessions.length, 1);
});

test('new date, time, entity references, and number fields reject invalid data', () => {
  const { store, apply, now } = setup();
  const id = apply({ op: 'add', title: 'Task' }).data.item.id;
  for (const request of [
    { op: 'add', title: 'Bad date', dueDate: '2026-02-30' },
    { op: 'update', id, estimateMinutes: -1 },
    { op: 'update', id, status: 'finished' },
    { op: 'update', id, status: 'done', done: false },
    { op: 'update', id, projectId: 'unknown' },
    { op: 'log.add', text: 'Future', time: now() + 120000 },
    { op: 'log.add', text: 'Unsafe link', url: 'javascript:alert(1)' },
    { op: 'plan.save', date: '2026-11-09', taskIds: ['unknown'] },
    { op: 'settings.update', timezone: 'Not/A/Timezone' },
    { op: 'settings.update', capacityMinutes: -5 },
    { op: 'settings.update', bufferPercent: 100 },
  ]) assert.equal(store.apply(request).ok, false, JSON.stringify(request));
  assert.equal(store.document().items.length, 1);
  assert.equal(store.document().events.length, 1);
});

test('today follows the explicit workbench timezone and history queries are paginated read-only', () => {
  const { store, apply } = setup();
  apply({ op: 'settings.update', timezone: 'America/Los_Angeles' });
  const id = apply({ op: 'add', title: 'Local day', today: true }).data.item.id;
  assert.equal(store.snapshot().todayDate, '2026-11-08');
  assert.equal(store.snapshot().items[0].todayDate, '2026-11-08');
  apply({ op: 'update', id, done: true });
  const before = store.snapshot().revision;
  const result = apply({ op: 'query', collection: 'events', offset: 1, limit: 1 });
  assert.equal(result.data.records.length, 1);
  assert.equal(result.data.records[0].type, 'completed');
  assert.equal(result.data.total, 2);
  assert.equal(store.snapshot().revision, before);
  assert.equal('events' in store.snapshot(), false);
});

test('more than 500 imported tasks survive and 20,000 history events are not truncated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-workbench-volume-'));
  try {
    const source = join(dir, 'todos.json');
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}`, done: i % 2 === 0, tags: [], createdAt: 1, updatedAt: 2 }));
    writeFileSync(source, JSON.stringify({ version: 2, revision: 1, items }));
    const store = createTodoStore({ file: source, warn() {} });
    assert.equal(store.apply({ op: 'update', id: 'task-999', title: 'Preserved' }).ok, true);
    const file = versionedDataFile(source);
    const document = JSON.parse(readFileSync(file, 'utf8'));
    const first = document.events[0];
    document.events = Array.from({ length: 20000 }, (_, i) => ({ ...first, id: `event-${i}`, at: i + 1 }));
    writeFileSync(file, JSON.stringify(document));
    const reopened = createTodoStore({ file: source, warn() {} });
    assert.equal(reopened.apply({ op: 'update', id: 'task-999', description: 'Still retained' }).ok, true);
    const persisted = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(persisted.items.length, 1000);
    assert.equal(persisted.events.length, 20001);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
