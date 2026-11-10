import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityGrid, capacitySegments, projectHealth, STALL_DAYS } from '../src/client/scene-data.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 4);

test('project health surfaces overdue and stalled projects with their next task', () => {
  const health = projectHealth({
    now: NOW, today: '2026-11-10',
    projects: [{ id: 'calm', name: 'Calm' }, { id: 'late', name: 'Late' }, { id: 'idle', name: 'Idle' }, { id: 'old', name: 'Old', status: 'archived' }],
    items: [
      { id: 1, projectId: 'calm', title: 'C1', priority: 'P2' }, { id: 2, projectId: 'calm', title: 'C0', priority: 'P0' },
      { id: 3, projectId: 'calm', done: true, completedAt: NOW - DAY },
      { id: 4, projectId: 'late', title: 'Soon', dueDate: '2026-11-12' }, { id: 5, projectId: 'late', title: 'Missed', dueDate: '2026-11-08' },
      { id: 6, projectId: 'idle', title: 'Waiting' }, { id: 7, projectId: 'idle', status: 'cancelled' },
      { id: 8, projectId: 'old', title: 'Ancient', dueDate: '2020-01-01' },
    ],
    logs: [{ projectId: 'late', at: NOW - 2 * DAY }, { projectId: 'idle', at: NOW - (STALL_DAYS + 1) * DAY }],
  });
  assert.deepEqual(health.map((entry) => entry.id), ['late', 'idle', 'calm', 'old'], 'overdue, then stalled, archived last');
  const [late, idle, calm, old] = health;
  assert.equal(late.overdue, 1);
  assert.deepEqual(late.next, { id: 5, title: 'Missed', dueDate: '2026-11-08', overdue: true });
  assert.equal(idle.stalled, true);
  assert.equal(idle.idleDays, STALL_DAYS + 1);
  assert.equal(calm.stalled, false);
  assert.equal(calm.next.title, 'C0', 'priority breaks ties without due dates');
  assert.equal(calm.progress, 1 / 3);
  assert.equal(old.stalled, false, 'archived projects never nag');
});

test('capacity segments mark buffer and overflow and widen the ring past capacity', () => {
  const tasks = [
    { id: 'a', title: 'A', estimateMinutes: 120 },
    { id: 'b', title: 'B', estimateMinutes: null },
    { id: 'c', title: 'C', estimateMinutes: 90 },
    { id: 'd', title: 'D', estimateMinutes: 60 },
  ];
  const ring = capacitySegments({ tasks, capacityMinutes: 240, bufferPercent: 25 });
  assert.equal(ring.usable, 180);
  assert.equal(ring.planned, 270);
  assert.deepEqual(ring.segments.map((segment) => segment.zone), ['planned', 'buffer', 'overflow']);
  assert.equal(ring.segments.at(-1).end, 1, 'the ring spans planned work when it exceeds capacity');
  assert.equal(ring.capacityAt, 240 / 270);
  assert.equal(ring.ratio, 1.5);

  const calm = capacitySegments({ tasks: [{ id: 'x', estimateMinutes: 150 }], capacityMinutes: 240, bufferPercent: 25 });
  assert.equal(calm.segments[0].zone, 'planned');
  assert.equal(calm.segments[0].end, 150 / 240);
  assert.equal(capacitySegments({ tasks: [{ id: 'y', estimateMinutes: 200 }], capacityMinutes: 240, bufferPercent: 25 }).segments[0].zone, 'buffer');
});

test('activity grid buckets by the workbench time zone and keeps the seven-day window', () => {
  // 2026-11-09 23:30 UTC is already 2026-11-10 07:30 in Singapore.
  const at = Date.UTC(2026, 10, 9, 23, 30);
  const grid = activityGrid({
    endDate: '2026-11-10', timezone: 'Asia/Singapore',
    logs: [{ at }, { at: Date.UTC(2026, 9, 1) }],
    focusSessions: [{ startedAt: at, minutes: 25 }],
    items: [{ done: true, completedAt: at }, { done: false, completedAt: at }],
    archivedItems: [{ done: true, completedAt: at }],
  });
  assert.deepEqual([grid.dates[0], grid.dates.at(-1)], ['2026-11-04', '2026-11-10']);
  const cell = grid.cells.find((entry) => entry.value > 0);
  assert.equal(cell.date, '2026-11-10');
  assert.equal(cell.fromHour, 6);
  assert.deepEqual([cell.focus, cell.logs, cell.done], [25, 1, 2]);
  assert.equal(cell.value, 25 + 15 + 40);
  assert.deepEqual(grid.totals, { focus: 25, logs: 1, done: 2 });
  assert.equal(grid.peak, cell);
  assert.equal(grid.perDay.at(-1).value, cell.value);
});
