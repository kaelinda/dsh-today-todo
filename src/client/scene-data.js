/**
 * Pure data shaping for the workbench's 3D views. No DOM, no Three.js, so the
 * mapping from workbench records to geometry is testable under `node --test`.
 */

const DAY_MS = 86_400_000;
const list = (value) => Array.isArray(value) ? value : [];
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Orbit radii, innermost first; the most active projects ride closest to the core. */
export const ORBIT_RADII = [2.15, 3.05, 3.95];
/** ponytail: more than 12 bodies stop reading as individual projects; the cards still list all. */
export const MAX_ORBIT_PROJECTS = 12;

/**
 * Place projects on orbits.
 * Size follows open work, brightness follows how recently anything happened.
 * @returns {{ nodes: object[], totalOpen: number }}
 */
export function projectOrbitLayout({ projects, items, logs, now = Date.now() }) {
  const lastActivity = new Map();
  const touch = (id, at) => {
    if (!id || !Number.isFinite(at)) return;
    if (!lastActivity.has(id) || lastActivity.get(id) < at) lastActivity.set(id, at);
  };
  for (const log of list(logs)) touch(log.projectId, log.at ?? log.createdAt);
  for (const item of list(items)) touch(item.projectId, item.completedAt ?? item.updatedAt);
  const open = new Map();
  let totalOpen = 0;
  for (const item of list(items)) {
    if (item.done || item.status === 'cancelled') continue;
    totalOpen += 1;
    if (item.projectId) open.set(item.projectId, (open.get(item.projectId) ?? 0) + 1);
  }
  const active = list(projects).filter((project) => project.status !== 'archived');
  const ranked = active.map((project) => {
    const at = lastActivity.get(project.id) ?? null;
    // Full brightness inside two days, fading to a floor over two weeks.
    const activity = at === null ? 0 : clamp01(1 - Math.max(0, now - at - 2 * DAY_MS) / (12 * DAY_MS));
    return { id: project.id, name: project.name, open: open.get(project.id) ?? 0, lastAt: at, activity };
  }).sort((a, b) => b.activity - a.activity || b.open - a.open || String(a.name).localeCompare(String(b.name)))
    .slice(0, MAX_ORBIT_PROJECTS);
  const perRing = ORBIT_RADII.map(() => []);
  ranked.forEach((node, index) => perRing[index % ORBIT_RADII.length].push(node));
  const nodes = [];
  perRing.forEach((ring, ringIndex) => ring.forEach((node, slot) => {
    nodes.push({
      ...node,
      ring: ringIndex,
      radius: ORBIT_RADII[ringIndex],
      // Spread bodies evenly per ring and stagger rings so they never stack.
      phase: (slot / ring.length) * Math.PI * 2 + ringIndex * 0.9,
      size: 0.55 + Math.min(1, Math.sqrt(node.open) / 4) * 0.75,
    });
  }));
  return { nodes, totalOpen };
}

/**
 * Split a capacity ring into one arc per selected task.
 * The ring spans the larger of capacity and planned work, so overload stays visible.
 * Fractions run 0..1 clockwise from the top.
 */
export function capacitySegments({ tasks, capacityMinutes, bufferPercent }) {
  const capacity = Math.max(0, Number(capacityMinutes) || 0);
  const usable = Math.round(capacity * (1 - clamp01((Number(bufferPercent) || 0) / 100)));
  const estimated = list(tasks).filter((task) => Number(task.estimateMinutes) > 0);
  const planned = estimated.reduce((sum, task) => sum + Number(task.estimateMinutes), 0);
  const span = Math.max(capacity, planned, 1);
  let cursor = 0;
  const segments = estimated.map((task) => {
    const minutes = Number(task.estimateMinutes);
    const start = cursor;
    cursor += minutes;
    // A task that ends past the usable line already eats into the buffer.
    const zone = cursor > capacity ? 'overflow' : cursor > usable ? 'buffer' : 'planned';
    return { id: task.id, title: task.title, minutes, start: start / span, end: cursor / span, zone };
  });
  return {
    segments, planned, capacity, usable,
    usableAt: usable / span, capacityAt: capacity / span,
    ratio: usable > 0 ? planned / usable : planned > 0 ? Infinity : 0,
  };
}

const formatters = new Map();
function zoned(at, timezone) {
  const key = timezone || 'local';
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }));
  }
  const parts = Object.fromEntries(formatters.get(key).formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}
export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Weight of one record in the terrain height. Shown separately in the readout. */
export const ACTIVITY_WEIGHTS = { focusMinute: 1, log: 15, done: 20 };

/**
 * Bucket recent activity into days × time-of-day cells in the workbench time zone.
 * ponytail: a focus session counts in the bucket where it started; long sessions
 * crossing a bucket edge are not split.
 */
export function activityGrid({ logs, focusSessions, items, archivedItems, endDate, timezone, days = 7, buckets = 12 }) {
  const dates = Array.from({ length: days }, (_, index) => shiftDate(endDate, index - days + 1));
  const dayIndex = new Map(dates.map((date, index) => [date, index]));
  const hoursPerBucket = 24 / buckets;
  const cells = dates.flatMap((date, day) => Array.from({ length: buckets }, (_, bucket) => ({
    day, bucket, date, fromHour: bucket * hoursPerBucket, focus: 0, logs: 0, done: 0, value: 0,
  })));
  const place = (at) => {
    if (!Number.isFinite(at)) return null;
    const { date, hour } = zoned(at, timezone);
    const day = dayIndex.get(date);
    return day === undefined ? null : cells[day * buckets + Math.floor(hour / hoursPerBucket)];
  };
  for (const session of list(focusSessions)) {
    const cell = place(session.startedAt);
    if (cell) cell.focus += Math.max(0, Number(session.minutes) || 0);
  }
  for (const log of list(logs)) {
    const cell = place(log.at ?? log.createdAt);
    if (cell) cell.logs += 1;
  }
  for (const item of [...list(items), ...list(archivedItems)]) {
    const cell = item.done ? place(item.completedAt) : null;
    if (cell) cell.done += 1;
  }
  let max = 0;
  const totals = { focus: 0, logs: 0, done: 0 };
  for (const cell of cells) {
    cell.focus = Math.round(cell.focus);
    cell.value = cell.focus * ACTIVITY_WEIGHTS.focusMinute + cell.logs * ACTIVITY_WEIGHTS.log + cell.done * ACTIVITY_WEIGHTS.done;
    max = Math.max(max, cell.value);
    totals.focus += cell.focus; totals.logs += cell.logs; totals.done += cell.done;
  }
  const perDay = dates.map((date, day) => {
    const row = cells.slice(day * buckets, (day + 1) * buckets);
    return { date, day, value: row.reduce((sum, cell) => sum + cell.value, 0),
      focus: row.reduce((sum, cell) => sum + cell.focus, 0), logs: row.reduce((sum, cell) => sum + cell.logs, 0),
      done: row.reduce((sum, cell) => sum + cell.done, 0) };
  });
  const peak = max > 0 ? cells.reduce((best, cell) => cell.value > best.value ? cell : best) : null;
  return { dates, buckets, hoursPerBucket, cells, max, totals, perDay, peak };
}
