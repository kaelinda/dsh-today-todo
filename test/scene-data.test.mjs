import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityGrid, capacitySegments, MAX_ORBIT_PROJECTS, ORBIT_RADII, projectOrbitLayout } from '../src/client/scene-data.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 4);

test('orbit layout sizes by open work, lights by recency, and skips archived projects', () => {
  const { nodes, totalOpen } = projectOrbitLayout({
    now: NOW,
    projects: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'z', name: 'Old', status: 'archived' }],
    items: [
      { id: 1, projectId: 'a' }, { id: 2, projectId: 'a' }, { id: 3, projectId: 'a', done: true, completedAt: NOW - 20 * DAY },
      { id: 4, projectId: 'b', status: 'cancelled' }, { id: 5 },
    ],
    logs: [{ projectId: 'b', at: NOW - DAY }],
  });
  assert.equal(totalOpen, 3);
  assert.deepEqual(nodes.map((node) => node.id), ['b', 'a'], 'recent activity rides the inner orbit first');
  const [beta, alpha] = nodes;
  assert.equal(beta.activity, 1);
  assert.equal(alpha.open, 2);
  assert.ok(alpha.size > beta.size, 'more open work draws a larger body');
  assert.equal(beta.radius, ORBIT_RADII[0]);
  assert.equal(alpha.radius, ORBIT_RADII[1]);
});

test('orbit layout caps visible bodies and spreads each ring evenly', () => {
  const projects = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}`, name: `P${String(index).padStart(2, '0')}` }));
  const { nodes } = projectOrbitLayout({ projects, items: [], logs: [], now: NOW });
  assert.equal(nodes.length, MAX_ORBIT_PROJECTS);
  const inner = nodes.filter((node) => node.ring === 0).map((node) => node.phase);
  assert.ok(Math.abs((inner[1] - inner[0]) - (Math.PI * 2) / inner.length) < 1e-9);
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
