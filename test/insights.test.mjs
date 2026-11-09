import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTodoStore } from '../lib/store.js';
import { aggregateFacts, applyInsightOperation, planningInsights } from '../lib/insights.js';
import { dueRoutineOccurrences } from '../lib/calendar.js';

const instant = (value) => Date.parse(value);
function setup(initial = '2026-11-02T08:00:00Z') {
  let now = instant(initial);
  const store = createTodoStore({ file: null, now: () => now });
  function call(request) {
    const result = store.apply(request);
    assert.equal(result.ok, true, `${JSON.stringify(request)}: ${result.message}`);
    return result.data;
  }
  call({ op: 'settings.update', timezone: 'UTC' });
  return { store, call, set: (value) => { now = instant(value); }, now: () => now };
}

function fixture() {
  const ctx = setup();
  const a = ctx.call({ op: 'project.save', name: '项目 A' }).project;
  const b = ctx.call({ op: 'project.save', name: '项目 B' }).project;
  const task = ctx.call({ op: 'add', title: '交付文档', projectId: a.id, tags: ['写作'] }).item;
  ctx.set('2026-11-03T08:00:00Z');
  ctx.call({ op: 'log.add', taskId: task.id, text: '完成结构设计，等待评审', kind: 'progress' });
  ctx.call({ op: 'update', id: task.id, done: true });
  return { ...ctx, a, b, task };
}

const week = { kind: 'weekly', startDate: '2026-11-02', endDate: '2026-11-09' };

test('historical report attribution uses event project/tags and includes archived work', () => {
  const ctx = fixture();
  ctx.set('2026-11-05T08:00:00Z');
  ctx.call({ op: 'update', id: ctx.task.id, projectId: ctx.b.id, tags: ['新标签'] });
  ctx.call({ op: 'clearDone' });
  ctx.call({ op: 'project.save', id: ctx.a.id, status: 'archived' });
  ctx.set('2026-11-10T08:00:00Z');
  ctx.call({ op: 'update', id: ctx.task.id, title: '后来的名字' });
  const facts = aggregateFacts(ctx.store.document(), { ...week, projectIds: [ctx.a.id], tags: ['写作'] }, { now: ctx.now() });
  assert.equal(facts.completedCount, 1);
  assert.equal(facts.completed[0].title, '交付文档');
  assert.equal(facts.logs.length, 1);
  assert.equal(facts.logs[0].projectId, ctx.a.id);
  assert.equal(aggregateFacts(ctx.store.document(), { ...week, projectIds: [ctx.b.id] }, { now: ctx.now() }).completedCount, 0);
  const all = aggregateFacts(ctx.store.document(), { ...week, projectIds: [ctx.a.id, ctx.b.id, ctx.a.id] }, { now: ctx.now() });
  assert.equal(all.completedCount, 1);
  assert.equal(all.projectIds.length, 2);
});

test('unfinished progress and unassigned work appear without inventing completed results', () => {
  const ctx = setup();
  const task = ctx.call({ op: 'add', title: '需要几周的大任务' }).item;
  ctx.call({ op: 'log.add', taskId: task.id, text: '完成需求梳理', kind: 'outcome', minutes: 30 });
  ctx.set('2026-11-10T08:00:00Z');
  const result = ctx.call({ op: 'report.generate', ...week });
  assert.equal(result.document.facts.completedCount, 0);
  assert.match(result.document.content, /完成需求梳理/);
  assert.match(result.document.content, /未归属项目/);
  assert.match(result.document.content, /没有可核实的本期新完成记录/);
  assert.equal(result.document.facts.sourceRefs.some((ref) => ref.collection === 'logs'), true);
});

test('completion/reopen/recompletion counts the historical end state, not current state', () => {
  const ctx = fixture();
  ctx.set('2026-11-07T08:00:00Z');
  ctx.call({ op: 'update', id: ctx.task.id, done: false });
  ctx.set('2026-11-10T08:00:00Z');
  ctx.call({ op: 'update', id: ctx.task.id, done: true });
  const old = aggregateFacts(ctx.store.document(), week, { now: ctx.now() });
  assert.equal(old.completedCount, 0);
  assert.equal(old.reopened.length, 1);
  const current = aggregateFacts(ctx.store.document(), { ...week, startDate: '2026-11-09', endDate: '2026-11-16' }, { now: ctx.now() });
  assert.equal(current.completedCount, 1, 'events in the current millisecond are included in partial reports');
  assert.equal(current.partial, true);
});

test('unknown migrated completion time is never treated as a new completion', () => {
  const ctx = setup();
  const doc = ctx.store.document();
  const task = { id: 'legacy', title: '旧任务', status: 'done', done: true, completedAt: null, createdAt: 100, updatedAt: 200, tags: [], projectId: null };
  doc.items.push(task);
  doc.events.push({ id: 'import', type: 'imported', taskId: task.id, at: ctx.now(), after: task, item: task, projectId: null, tags: [] });
  const facts = aggregateFacts(doc, week, { now: instant('2026-11-10T08:00:00Z') });
  assert.equal(facts.completedCount, 0);
  assert.equal(facts.activityCount, 0);
});

test('manual/final content survives regeneration and old versions can be restored', () => {
  const ctx = fixture();
  ctx.set('2026-11-10T08:00:00Z');
  const generated = ctx.call({ op: 'report.generate', ...week }).document;
  const saved = ctx.call({ op: 'document.save', id: generated.id, content: '人工确认的周报。', status: 'final', baseRevisionId: generated.currentRevisionId }).document;
  const regenerated = ctx.call({ op: 'report.generate', documentId: generated.id });
  assert.equal(regenerated.preservedCurrent, true);
  assert.equal(regenerated.document.content, '人工确认的周报。');
  assert.equal(regenerated.document.status, 'final');
  assert.notEqual(regenerated.document.candidateRevisionId, saved.currentRevisionId);
  assert.equal(regenerated.document.revisions.length, 3);
  const staleRestore = ctx.store.apply({ op: 'document.restore', id: generated.id, revisionId: generated.currentRevisionId, baseRevisionId: generated.currentRevisionId });
  assert.equal(staleRestore.code, 'todo_revision_conflict');
  const missingRestoreBase = ctx.store.apply({ op: 'document.restore', id: generated.id, revisionId: generated.currentRevisionId });
  assert.equal(missingRestoreBase.code, 'todo_revision_conflict');
  const restored = ctx.call({ op: 'document.restore', id: generated.id, revisionId: generated.currentRevisionId, baseRevisionId: regenerated.document.currentRevisionId }).document;
  assert.equal(restored.content, generated.content);
  assert.equal(restored.revisions.length, 4);
  assert.equal(restored.status, 'draft');
  const conflict = ctx.store.apply({ op: 'document.save', id: generated.id, content: '旧标签页', baseRevisionId: saved.currentRevisionId });
  assert.equal(conflict.code, 'todo_revision_conflict');
  const full = ctx.call({ op: 'document.get', id: generated.id }).document;
  assert.equal(full.revisions[1].content, '人工确认的周报。');
  for (const patch of [{ projectIds: [ctx.b.id] }, { startDate: '2026-11-01' }, { kind: 'monthly' }, { tags: ['new'] }, { title: '换一个标题' }]) {
    const rejected = ctx.store.apply({ op: 'report.generate', documentId: generated.id, ...patch });
    assert.equal(rejected.ok, false, JSON.stringify(patch));
  }
  const after = ctx.call({ op: 'document.get', id: generated.id }).document;
  assert.deepEqual(after.projectIds, after.facts.projectIds);
  assert.equal(after.startDate, after.facts.startDate);
  assert.equal(after.revisions.length, 4);
});

test('review remains pending and creates traceable next-cycle actions without leaking private content', () => {
  const ctx = fixture();
  ctx.set('2026-11-10T08:00:00Z');
  const review = ctx.call({ op: 'review.generate', ...week, projectIds: [ctx.a.id] }).document;
  assert.equal(review.type, 'review');
  assert.equal(review.status, 'pending');
  assert.match(review.content, /原因暂作假设/);
  ctx.call({ op: 'document.save', id: review.id, content: '私人反思：需要调整沟通习惯。', status: 'final' });
  const action = ctx.call({ op: 'review.action', documentId: review.id, title: '试行集中答疑时段', projectId: ctx.a.id, dueDate: '2026-11-20', successCriteria: '检查中断次数与响应影响' });
  assert.equal(action.task.quadrant, 'q2');
  assert.equal(action.task.reviewId, review.id);
  assert.equal(ctx.store.document().events.at(-1).taskId, action.task.id);
  const report = ctx.call({ op: 'report.generate', ...week }).document;
  assert.doesNotMatch(report.content, /私人反思/);
  ctx.set('2026-11-17T08:00:00Z');
  const nextReview = ctx.call({ op: 'review.generate', kind: 'weekly', startDate: '2026-11-09', endDate: '2026-11-16', projectIds: [ctx.a.id] }).document;
  assert.match(nextReview.content, /试行集中答疑时段/);
  assert.match(nextReview.content, /检查中断次数与响应影响/);
});

test('a reopened task completed in another project has only one final completion attribution', () => {
  const ctx = fixture();
  ctx.set('2026-11-04T08:00:00Z');
  ctx.call({ op: 'update', id: ctx.task.id, done: false });
  ctx.call({ op: 'update', id: ctx.task.id, projectId: ctx.b.id, tags: ['新标签'] });
  ctx.set('2026-11-05T08:00:00Z');
  ctx.call({ op: 'update', id: ctx.task.id, done: true });
  ctx.set('2026-11-10T08:00:00Z');
  const facts = (scope) => aggregateFacts(ctx.store.document(), { ...week, ...scope }, { now: ctx.now() });
  assert.equal(facts({}).completedCount, 1);
  assert.equal(facts({ projectIds: [ctx.a.id] }).completedCount, 0);
  assert.equal(facts({ projectIds: [ctx.b.id] }).completedCount, 1);
  assert.equal(facts({ tags: ['写作'] }).completedCount, 0);
  assert.equal(facts({ tags: ['新标签'] }).completedCount, 1);
});

test('independent project routines produce separate drafts and a stable period key prevents duplicates', () => {
  const ctx = fixture();
  const a = ctx.call({ op: 'routine.save', name: 'A 周报', kind: 'report', reportKind: 'weekly', frequency: 'weekly', weekdays: [1], time: '09:00', projectIds: [ctx.a.id] }).routine;
  const all = ctx.call({ op: 'routine.save', name: '全项目周报', kind: 'report', reportKind: 'weekly', frequency: 'weekly', weekdays: [1], time: '09:00' }).routine;
  ctx.set('2026-11-09T10:00:00Z');
  const first = ctx.call({ op: 'routine.run', id: a.id, scheduledAt: instant('2026-11-09T09:00:00Z') });
  assert.equal(first.run.status, 'completed');
  assert.equal(first.document.facts.completedCount, 1);
  ctx.call({ op: 'routine.save', id: a.id, projectIds: [ctx.b.id] });
  const duplicate = ctx.call({ op: 'routine.run', id: a.id, scheduledAt: instant('2026-11-09T09:00:00Z') });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.run.scope.projectIds, [ctx.a.id]);
  ctx.call({ op: 'routine.run', id: all.id, scheduledAt: instant('2026-11-09T09:00:00Z') });
  assert.equal(ctx.store.document().documents.length, 2);
  assert.equal(ctx.store.document().runs.length, 2);
  assert.deepEqual(dueRoutineOccurrences(ctx.store.document(), ctx.now()), []);
});

test('custom review cadence, preview, reminders, snooze and explicit skipped periods work', () => {
  const ctx = setup();
  const request = { name: '每三天复盘', kind: 'review', reportKind: 'daily', frequency: 'interval', interval: 3, unit: 'day', anchorDate: '2026-11-02', time: '09:00', mode: 'remind', coverage: 'previous' };
  const preview = ctx.call({ op: 'routine.preview', ...request });
  assert.equal(preview.nextRuns[0].date, '2026-11-02');
  assert.equal(ctx.store.document().routines.length, 0);
  const routine = ctx.call({ op: 'routine.save', ...request }).routine;
  ctx.set('2026-11-05T10:00:00Z');
  const reminded = ctx.call({ op: 'routine.run', id: routine.id, scheduledAt: instant('2026-11-05T09:00:00Z') });
  assert.equal(reminded.run.status, 'reminder');
  assert.equal(reminded.run.startDate, '2026-11-02');
  assert.equal(reminded.run.endDate, '2026-11-05');
  assert.equal(ctx.store.document().documents.length, 0);
  const generated = ctx.call({ op: 'routine.generate', runId: reminded.run.id });
  assert.equal(generated.document.type, 'review');
  assert.equal(generated.document.status, 'pending');
  assert.equal(ctx.call({ op: 'routine.generate', runId: reminded.run.id }).duplicate, true);
  ctx.set('2026-11-08T10:00:00Z');
  ctx.call({ op: 'routine.snooze', id: routine.id, minutes: 60 });
  assert.deepEqual(dueRoutineOccurrences(ctx.store.document(), ctx.now()), []);
  ctx.call({ op: 'routine.skip', id: routine.id, scheduledAt: instant('2026-11-08T09:00:00Z') });
  ctx.set('2026-11-08T12:00:00Z');
  assert.deepEqual(dueRoutineOccurrences(ctx.store.document(), ctx.now()), []);
  assert.equal(ctx.store.document().routines[0].anchorDate, '2026-11-02');
});

test('every-three-day drafts and previews use an explicit seven-day rolling window', () => {
  const ctx = setup('2026-11-02T08:00:00Z');
  ctx.call({ op: 'log.add', kind: 'progress', text: '滚动七天范围内、触发间隔之外的进展' });
  const routine = ctx.call({ op: 'routine.save', name: '三天触发七天回顾', kind: 'review', frequency: 'interval',
    interval: 3, anchorDate: '2026-11-02', time: '09:00', coverage: 'rolling', windowDays: 7 }).routine;
  assert.equal(routine.windowDays, 7);
  ctx.set('2026-11-07T08:00:00Z');
  const preview = ctx.call({ op: 'routine.preview', id: routine.id }).nextRuns[0];
  assert.equal(preview.date, '2026-11-08');
  assert.equal(preview.startDate, '2026-11-01');
  assert.equal(preview.endDate, '2026-11-08');
  ctx.set('2026-11-08T10:00:00Z');
  const generated = ctx.call({ op: 'routine.run', id: routine.id, scheduledAt: preview.scheduledAt });
  assert.equal(generated.document.startDate, preview.startDate);
  assert.equal(generated.document.endDate, preview.endDate);
  assert.match(generated.document.content, /触发间隔之外的进展/);
  const defaults = ctx.call({ op: 'routine.save', frequency: 'interval', interval: 3 }).routine;
  assert.equal(defaults.coverage, 'rolling');
  assert.equal(defaults.windowDays, 7, 'rolling default matches the editor, not trigger interval');
});

test('confirmed plan baseline, unknown estimates, Q2, postponement and repeated blockers produce evidence', () => {
  const ctx = setup();
  const task = ctx.call({ op: 'add', title: '重点', quadrant: 'q2', estimateMinutes: 180, plannedDate: '2026-11-02', today: true }).item;
  const unknown = ctx.call({ op: 'add', title: '待估时', quadrant: 'q2', today: true }).item;
  ctx.call({ op: 'plan.save', period: 'day', date: '2026-11-02', taskIds: [task.id], capacityMinutes: 120, bufferPercent: 25, commit: true });
  ctx.call({ op: 'plan.save', period: 'day', date: '2026-11-02', taskIds: [task.id, unknown.id], capacityMinutes: 120, bufferPercent: 25 });
  ctx.call({ op: 'log.add', taskId: task.id, kind: 'blocker', text: '等待评审' });
  ctx.call({ op: 'log.add', taskId: task.id, kind: 'blocker', text: '评审仍未完成' });
  ctx.call({ op: 'update', id: task.id, plannedDate: '2026-11-03' });
  ctx.call({ op: 'update', id: task.id, plannedDate: '2026-11-04' });
  const insights = planningInsights(ctx.store.document(), { now: ctx.now() });
  assert.equal(insights.budgetMinutes, 90);
  assert.equal(insights.unestimatedCount, 1);
  assert.equal(insights.committedCount, 1);
  assert.deepEqual(insights.insertedTaskIds, [unknown.id]);
  for (const kind of ['capacity', 'estimate', 'postponed', 'blocker']) assert.equal(insights.suggestions.some((entry) => entry.kind === kind), true, kind);
  ctx.set('2026-11-03T08:00:00Z');
  ctx.call({ op: 'update', id: task.id, done: true });
  assert.equal(planningInsights(ctx.store.document(), { date: '2026-11-02', now: ctx.now() }).completedCount, 0, 'later completion must not rewrite yesterday');
  assert.equal(planningInsights(ctx.store.document(), { now: ctx.now() }).fulfillmentRate, null, 'unconfirmed days have no rate');
  const review = ctx.call({ op: 'review.generate', kind: 'daily', startDate: '2026-11-02', endDate: '2026-11-03' }).document;
  assert.match(review.content, /首次确认 1 项，周期末完成 0 项，后来加入 1 项/);
  assert.equal(review.facts.plans[0].baselineTaskIds[0], task.id);
});

test('skip before an interval occurrence skips that scheduled period and leaves the anchor intact', () => {
  const ctx = setup('2026-11-02T08:00:00Z');
  const routine = ctx.call({ op: 'routine.save', frequency: 'interval', interval: 3, anchorDate: '2026-11-02', time: '09:00' }).routine;
  const skipped = ctx.call({ op: 'routine.skip', id: routine.id }).run;
  assert.equal(skipped.scheduledAt, instant('2026-11-02T09:00:00Z'));
  ctx.set('2026-11-02T10:00:00Z');
  assert.deepEqual(dueRoutineOccurrences(ctx.store.document(), ctx.now()), []);
  const next = ctx.call({ op: 'routine.preview', id: routine.id }).nextRuns[0];
  assert.equal(next.date, '2026-11-05');
});

test('editing a cadence starts future occurrences without interpreting past days under the new rule', () => {
  const ctx = setup('2026-11-02T08:00:00Z');
  const routine = ctx.call({ op: 'routine.save', frequency: 'weekly', weekdays: [1], time: '09:00' }).routine;
  ctx.set('2026-11-10T10:00:00Z');
  ctx.call({ op: 'routine.save', id: routine.id, frequency: 'daily', reportKind: 'daily' });
  assert.deepEqual(dueRoutineOccurrences(ctx.store.document(), ctx.now()), []);
  ctx.set('2026-11-11T10:00:00Z');
  assert.equal(dueRoutineOccurrences(ctx.store.document(), ctx.now())[0].startDate, '2026-11-10');
});

test('invalid entity/date/routine parameters fail before a transaction is committed', () => {
  const ctx = setup();
  for (const request of [
    { op: 'report.generate', startDate: '2026-02-30', endDate: '2026-03-01' },
    { op: 'report.generate', startDate: '2026-11-02', endDate: '2026-11-02' },
    { op: 'report.generate', projectIds: ['missing'] },
    { op: 'routine.save', frequency: 'interval', interval: 0 },
    { op: 'routine.save', timezone: 'nonsense' },
    { op: 'routine.save', time: '25:00' },
    { op: 'routine.save', monthDay: 32 },
    { op: 'routine.save', weekdays: [] },
    { op: 'routine.save', kind: 'secret' },
    { op: 'review.action', documentId: 'missing', title: 'action' },
  ]) {
    const before = ctx.store.document();
    const result = ctx.store.apply(request);
    assert.equal(result.ok, false, JSON.stringify(request));
    assert.deepEqual(ctx.store.document(), before, JSON.stringify(request));
  }
  assert.equal(applyInsightOperation(ctx.store.document(), { op: 'unknown' }, { now: ctx.now() }), null);
});
