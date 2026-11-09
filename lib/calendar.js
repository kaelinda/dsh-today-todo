/** Calendar dates stay dates; instants are interpreted in an explicit IANA zone. */
const DAY = 86_400_000;
const formatters = new Map();

function invalid(message) {
  const error = new Error(message);
  error.code = 'todo_bad_request';
  throw error;
}

export function validTimezone(value) {
  if (typeof value !== 'string' || value.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
}

export function dateParts(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid('Use a calendar date in YYYY-MM-DD format.');
  const [year, month, day] = date.split('-').map(Number);
  const instant = new Date(`${date}T00:00:00.000Z`);
  if (year < 1900 || !Number.isFinite(+instant) || instant.toISOString().slice(0, 10) !== date) invalid(`Invalid calendar date: ${date}`);
  return { year, month, day };
}

export function isDateKey(value) {
  try { dateParts(value); return true; } catch { return false; }
}

function formatter(timezone) {
  if (formatters.has(timezone)) return formatters.get(timezone);
  if (!validTimezone(timezone)) invalid(`Invalid timezone: ${timezone}`);
  if (!formatters.has(timezone)) formatters.set(timezone, new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }));
  return formatters.get(timezone);
}

export function zonedParts(at = Date.now(), timezone = 'UTC') {
  const value = typeof at === 'number' ? at : +new Date(at);
  if (!Number.isFinite(value)) invalid('Invalid timestamp.');
  return Object.fromEntries(formatter(timezone).formatToParts(new Date(value))
    .filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function key({ year, month, day }) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
export function zonedDateKey(at = Date.now(), timezone = 'UTC') { return key(zonedParts(at, timezone)); }

export function addDays(date, days) {
  dateParts(date);
  if (!Number.isInteger(days)) invalid('Calendar day offset must be an integer.');
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(start, end) {
  dateParts(start); dateParts(end);
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
}

export function monthStart(date) { return `${date.slice(0, 7)}-01`; }
export function addMonths(date, months) {
  const { year, month, day } = dateParts(date);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return key({ year: first.getUTCFullYear(), month: first.getUTCMonth() + 1, day: Math.min(day, last) });
}

export function weekday(date) { dateParts(date); return new Date(`${date}T00:00:00Z`).getUTCDay(); }
export function weekStart(date, weekStartsOn = 1) {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) invalid('weekStartsOn must be 0–6.');
  return addDays(date, -((weekday(date) - weekStartsOn + 7) % 7));
}

/** Gaps are skipped; repeated wall times choose their first occurrence. */
export function wallTimeToInstant(date, time = '00:00', timezone = 'UTC') {
  const { year, month, day } = dateParts(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) invalid('Use a time in HH:mm format.');
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set();
  for (const delta of [-2 * DAY, -DAY, 0, DAY, 2 * DAY]) {
    const at = wall + delta;
    const p = zonedParts(at, timezone);
    offsets.add(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at);
  }
  const matches = [...offsets].map((offset) => wall - offset).filter((at) => {
    const p = zonedParts(at, timezone);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
  });
  return matches.length ? Math.min(...matches) : null;
}

/** Some zones change offset at midnight: a calendar day begins at its first valid minute. */
export function dayStart(date, timezone = 'UTC') {
  for (let minute = 0; minute < 180; minute += 1) {
    const value = wallTimeToInstant(date, `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, timezone);
    if (value !== null) return value;
  }
  invalid(`Calendar date ${date} has no supported day boundary in ${timezone}.`);
}

export function calendarPeriod(kind, at = Date.now(), { timezone = 'UTC', weekStartsOn = 1, previous = false } = {}) {
  const today = zonedDateKey(at, timezone);
  let startDate; let endDate;
  if (kind === 'daily') {
    startDate = previous ? addDays(today, -1) : today;
    endDate = addDays(startDate, 1);
  } else if (kind === 'weekly') {
    startDate = weekStart(today, weekStartsOn);
    if (previous) startDate = addDays(startDate, -7);
    endDate = addDays(startDate, 7);
  } else if (kind === 'monthly') {
    startDate = monthStart(today);
    if (previous) startDate = addMonths(startDate, -1);
    endDate = addMonths(startDate, 1);
  } else invalid(`Unknown report period: ${kind}`);
  return { startDate, endDate, timezone, periodStart: dayStart(startDate, timezone), periodEnd: dayStart(endDate, timezone) };
}

export function routinePeriod(routine, scheduledAt, settings = {}) {
  const timezone = routine.timezone || settings.timezone || 'UTC';
  const today = zonedDateKey(scheduledAt, timezone);
  if (routine.coverage === 'rolling' || (routine.frequency === 'interval' && routine.coverage !== 'current')) {
    // Trigger cadence and coverage are independent: every three days may look
    // back seven days. Only "previous" interval coverage uses the cadence span.
    const days = routine.coverage === 'rolling'
      ? Number(routine.windowDays ?? 7)
      : Number(routine.interval || 1) * (routine.unit === 'week' ? 7 : 1);
    const startDate = addDays(today, -days);
    return { startDate, endDate: today, timezone, periodStart: dayStart(startDate, timezone), periodEnd: dayStart(today, timezone) };
  }
  return calendarPeriod(routine.reportKind || 'weekly', scheduledAt, {
    timezone, weekStartsOn: settings.weekStartsOn ?? 1, previous: routine.coverage !== 'current',
  });
}

function isOccurrenceDate(routine, date) {
  if (routine.anchorDate && date < routine.anchorDate) return false;
  if (routine.frequency === 'daily') return true;
  if (routine.frequency === 'weekly') return (routine.weekdays || [1]).includes(weekday(date));
  if (routine.frequency === 'monthly') {
    const { year, month, day } = dateParts(date);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day === Math.min(routine.monthDay === 'last' ? last : Number(routine.monthDay || 1), last);
  }
  if (routine.frequency === 'interval') {
    const span = Number(routine.interval || 1) * (routine.unit === 'week' ? 7 : 1);
    return daysBetween(routine.anchorDate, date) % span === 0;
  }
  return false;
}

export function routinePreview(routine, from = Date.now(), count = 3, settings = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 20) invalid('Preview count must be 1–20.');
  const timezone = routine.timezone || settings.timezone || 'UTC';
  const firstDate = zonedDateKey(from, timezone);
  const result = [];
  for (let offset = 0; offset < 10_960 && result.length < count; offset += 1) {
    const date = addDays(firstDate, offset);
    if (!isOccurrenceDate(routine, date)) continue;
    const scheduledAt = wallTimeToInstant(date, routine.time || '09:00', timezone);
    if (scheduledAt === null || scheduledAt <= from) continue;
    result.push({ scheduledAt, date, time: routine.time || '09:00', ...routinePeriod(routine, scheduledAt, settings) });
  }
  return result;
}

/** Latest missed occurrence only; earlier misses remain discoverable without creating a backlog. */
export function dueRoutineOccurrences(document, now = Date.now()) {
  const result = [];
  for (const routine of document.routines || []) {
    if (!routine.enabled || routine.snoozedUntil > now) continue;
    const zone = routine.timezone || document.settings?.timezone || 'UTC';
    const earliest = routine.enabledAt ?? routine.createdAt ?? now;
    let date = zonedDateKey(now, zone);
    const earliestDate = zonedDateKey(earliest, zone);
    let latest = null;
    let latestHandled = false;
    let olderMissed = 0;
    const seenPeriods = new Set();
    for (let i = 0; i < 10_960 && date >= earliestDate; i += 1, date = addDays(date, -1)) {
      if (!isOccurrenceDate(routine, date)) continue;
      const scheduledAt = wallTimeToInstant(date, routine.time || '09:00', zone);
      if (scheduledAt === null || scheduledAt > now || scheduledAt < earliest) continue;
      const period = routinePeriod(routine, scheduledAt, document.settings);
      const periodKey = `${period.periodStart}/${period.periodEnd}`;
      if (seenPeriods.has(periodKey)) continue;
      seenPeriods.add(periodKey);
      const run = (document.runs || []).find((entry) => entry.routineId === routine.id
        && entry.periodStart === period.periodStart && entry.periodEnd === period.periodEnd);
      const occurrence = { routineId: routine.id, scheduledAt, ...period };
      const handled = run && ['completed', 'reminder', 'skipped'].includes(run.status);
      if (!latest) { latest = occurrence; latestHandled = Boolean(handled); }
      else if (!handled) olderMissed += 1;
    }
    if (latest && !latestHandled) result.push({ ...latest, olderMissed });
  }
  return result;
}
