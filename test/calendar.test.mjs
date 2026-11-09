import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays, calendarPeriod, dayStart, dueRoutineOccurrences, isDateKey, routinePeriod,
  routinePreview, wallTimeToInstant, weekStart, zonedDateKey,
} from '../lib/calendar.js';

const at = (value) => Date.parse(value);
const base = { id: 'routine-one', enabled: true, frequency: 'daily', reportKind: 'daily', coverage: 'previous',
  timezone: 'Asia/Singapore', time: '09:00', anchorDate: '2026-11-01', createdAt: at('2026-11-01T00:00:00Z') };

test('calendar dates, explicit timezone and exclusive day boundaries are validated', () => {
  assert.equal(isDateKey('2026-02-29'), false);
  assert.equal(isDateKey('2028-02-29'), true);
  assert.equal(zonedDateKey(at('2026-11-09T18:00:00Z'), 'Asia/Singapore'), '2026-11-10');
  assert.equal(dayStart('2026-11-10', 'Asia/Singapore'), at('2026-11-09T16:00:00Z'));
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.throws(() => dayStart('2026-02-30', 'UTC'), /Invalid/);
  assert.throws(() => zonedDateKey(Date.now(), 'wrong/zone'), /Invalid/);
});

test('natural weeks and months cross year boundaries without becoming rolling windows', () => {
  const previous = calendarPeriod('weekly', at('2027-01-04T08:00:00Z'), { timezone: 'UTC', previous: true });
  assert.equal(previous.startDate, '2026-12-28');
  assert.equal(previous.endDate, '2027-01-04');
  assert.equal(weekStart('2027-01-03', 0), '2027-01-03');
  const month = calendarPeriod('monthly', at('2027-01-04T08:00:00Z'), { previous: true });
  assert.equal(month.startDate, '2026-12-01');
  assert.equal(month.endDate, '2027-01-01');
  const rolling = routinePeriod({ ...base, frequency: 'interval', interval: 7, unit: 'day', coverage: 'rolling' }, at('2027-01-06T08:00:00Z'));
  assert.equal(rolling.startDate, '2026-12-30');
  assert.equal(rolling.endDate, '2027-01-06');
});

test('monthly day 31 clamps to month end and interval dates stay anchored', () => {
  const monthly = routinePreview({ ...base, frequency: 'monthly', monthDay: 31 }, at('2027-01-01T00:00:00Z'));
  assert.deepEqual(monthly.map((row) => row.date), ['2027-01-31', '2027-02-28', '2027-03-31']);
  const interval = routinePreview({ ...base, frequency: 'interval', interval: 3, unit: 'day', anchorDate: '2026-11-01' }, at('2026-11-05T00:00:00Z'));
  assert.deepEqual(interval.map((row) => row.date), ['2026-11-07', '2026-11-10', '2026-11-13']);
  assert.deepEqual(routinePreview({ ...base, frequency: 'weekly', weekdays: [2, 4] }, at('2026-11-09T02:00:00Z')).map((row) => row.date), ['2026-11-10', '2026-11-12', '2026-11-17']);
});

test('interval trigger cadence is independent of rolling or current coverage', () => {
  const rule = { ...base, frequency: 'interval', interval: 3, unit: 'day', anchorDate: '2026-11-01', reportKind: 'weekly', windowDays: 7 };
  const scheduledAt = at('2026-11-10T01:00:00Z');
  const rolling = routinePeriod({ ...rule, coverage: 'rolling' }, scheduledAt);
  assert.equal(rolling.startDate, '2026-11-03');
  assert.equal(rolling.endDate, '2026-11-10');
  const previous = routinePeriod({ ...rule, coverage: 'previous' }, scheduledAt);
  assert.equal(previous.startDate, '2026-11-07');
  assert.equal(previous.endDate, '2026-11-10');
  const current = routinePeriod({ ...rule, coverage: 'current' }, scheduledAt, { weekStartsOn: 1 });
  assert.equal(current.startDate, '2026-11-09');
  assert.equal(current.endDate, '2026-11-16');
  const preview = routinePreview({ ...rule, coverage: 'rolling' }, at('2026-11-09T00:00:00Z'));
  assert.deepEqual(preview.map((row) => row.date), ['2026-11-10', '2026-11-13', '2026-11-16']);
  assert.deepEqual(preview.map((row) => row.startDate), ['2026-11-03', '2026-11-06', '2026-11-09']);
});

test('DST gaps are skipped, repeated times pick first occurrence, and day durations vary', () => {
  assert.equal(wallTimeToInstant('2026-03-08', '02:30', 'America/New_York'), null);
  assert.equal(wallTimeToInstant('2026-11-01', '01:30', 'America/New_York'), at('2026-11-01T05:30:00Z'));
  assert.equal(dayStart('2026-03-09', 'America/New_York') - dayStart('2026-03-08', 'America/New_York'), 23 * 3_600_000);
  const previews = routinePreview({ ...base, timezone: 'America/New_York', time: '02:30', anchorDate: '2026-03-01' }, at('2026-03-07T08:00:00Z'));
  assert.deepEqual(previews.map((row) => row.date), ['2026-03-09', '2026-03-10', '2026-03-11']);
});

test('catch-up offers only the latest missing period and never drains older periods after completion', () => {
  const doc = { routines: [base], runs: [], settings: { timezone: 'Asia/Singapore', weekStartsOn: 1 } };
  const now = at('2026-11-10T02:00:00Z');
  const due = dueRoutineOccurrences(doc, now);
  assert.equal(due.length, 1);
  assert.equal(due[0].startDate, '2026-11-09');
  assert.equal(due[0].olderMissed, 9);
  doc.runs.push({ routineId: base.id, periodStart: due[0].periodStart, periodEnd: due[0].periodEnd, status: 'completed' });
  assert.deepEqual(dueRoutineOccurrences(doc, now + 30_000), []);
  const next = dueRoutineOccurrences(doc, at('2026-11-11T02:00:00Z'));
  assert.equal(next.length, 1);
  assert.equal(next[0].startDate, '2026-11-10');
  assert.equal(next[0].olderMissed, 9);
});

test('paused, snoozed, skipped and already-reminded routines are not automatically repeated', () => {
  const now = at('2026-11-10T02:00:00Z');
  const doc = { routines: [{ ...base, enabled: false }], runs: [], settings: {} };
  assert.deepEqual(dueRoutineOccurrences(doc, now), []);
  doc.routines[0] = { ...base, snoozedUntil: now + 60_000 };
  assert.deepEqual(dueRoutineOccurrences(doc, now), []);
  doc.routines[0] = { ...base };
  const due = dueRoutineOccurrences(doc, now)[0];
  for (const status of ['skipped', 'reminder']) {
    doc.runs = [{ routineId: base.id, periodStart: due.periodStart, periodEnd: due.periodEnd, status }];
    assert.deepEqual(dueRoutineOccurrences(doc, now), []);
  }
});
