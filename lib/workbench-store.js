/** Pure v3 workbench data operations. All changes are committed by store.js. */
import { randomUUID } from 'node:crypto';

export const PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
export const QUADRANTS = Object.freeze(['q1', 'q2', 'q3', 'q4']);
const STATUSES = ['todo', 'doing', 'waiting', 'done', 'cancelled'];
export const COLLECTIONS = ['items', 'projects', 'events', 'logs', 'plans', 'focusSessions', 'routines', 'runs', 'documents'];
export const clone = (value) => structuredClone(value);
export const newId = (prefix) => `${prefix}-${randomUUID()}`;
export function invalid(message, code = 'todo_bad_request') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
export function normalizePriority(value) {
  const result = typeof value === 'string' ? value.trim().toUpperCase() : null;
  return PRIORITIES.includes(result) ? result : null;
}
export function normalizeQuadrant(value) {
  const result = typeof value === 'string' ? value.trim().toLowerCase() : null;
  return QUADRANTS.includes(result) ? result : null;
}
export function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return [];
    const tag = entry.replace(/\s+/g, ' ').trim().replace(/^#+/, '').slice(0, 24);
    if (!tag || seen.has(tag.toLowerCase())) return [];
    seen.add(tag.toLowerCase());
    return [tag];
  }).slice(0, 8);
}
export function normalizeTodayDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
export function dateKey(at = Date.now(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}
const text = (value, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const title = (value) => text(value, 200).replace(/\s+/g, ' ');
const optionalString = (value) => text(value, 500) || null;
function date(value, name, required = false) {
  if (value === null || value === undefined || value === '') {
    if (required) invalid(`${name} is required.`);
    return null;
  }
  const result = normalizeTodayDate(value);
  if (!result) invalid(`${name} must be a valid YYYY-MM-DD date.`);
  return result;
}
function number(value, name, fallback = null, max = 1000000) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) invalid(`${name} must be a number between 0 and ${max}.`);
  return value;
}
function timestamp(value, name, fallback) {
  if (value === undefined || value === null) return fallback;
  const result = typeof value === 'string' ? Date.parse(value) : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < 0) invalid(`${name} must be a valid timestamp.`);
  return result;
}
function timezone(value) {
  if (typeof value !== 'string' || value.length > 100) invalid('timezone must be an IANA time zone.');
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { invalid('timezone must be an IANA time zone.'); }
  return value;
}
export function emptyDocument() {
  return {
    version: 3, revision: 1,
    ...Object.fromEntries(COLLECTIONS.map((key) => [key, []])),
    settings: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', weekStartsOn: 1, capacityMinutes: 360, bufferPercent: 30 },
  };
}
export function migrateTask(raw, at) {
  if (!raw || typeof raw.id !== 'string' || !title(raw.title)) invalid('Legacy task has no usable ID or title; repair the source before migrating.', 'todo_invalid_document');
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : at;
  const sessionId = optionalString(raw.sessionId);
  return {
    id: raw.id, title: title(raw.title), done: raw.done === true,
    status: raw.done === true ? 'done' : 'todo', createdAt,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt,
    sessionId, sessionTitle: sessionId ? optionalString(raw.sessionTitle) : null,
    tags: normalizeTags(raw.tags), priority: normalizePriority(raw.priority), quadrant: normalizeQuadrant(raw.quadrant),
    todayDate: normalizeTodayDate(raw.todayDate), todayAt: Number.isFinite(raw.todayAt) ? raw.todayAt : null,
    projectId: null, dueDate: null, plannedDate: null, estimateMinutes: null, description: '', waitingFor: '', followUpDate: null,
    completedAt: null, archivedAt: null, deletedAt: null,
  };
}
function task(doc, id, includeHidden = false) {
  const result = doc.items.find((entry) => entry.id === id && (includeHidden || !entry.deletedAt));
  if (!result) invalid('No todo matches that id.', 'todo_not_found');
  return result;
}
function projectId(doc, value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !doc.projects.some((entry) => entry.id === value)) invalid('Project does not exist.', 'todo_not_found');
  return value;
}
export function recordTaskEvent(doc, type, before, after, at, source = 'user') {
  const item = after ?? before;
  const event = {
    id: newId('event'), type, at, taskId: item.id, projectId: item.projectId ?? null,
    tags: clone(item.tags ?? []), before: before ? clone(before) : null, after: after ? clone(after) : null,
    item: clone(item), source: text(source, 80) || 'user',
  };
  doc.events.push(event);
  return event;
}
function taskPatch(doc, request, current, at) {
  const next = { ...current };
  let changed = false;
  for (const name of ['title', 'description', 'waitingFor']) {
    if (request[name] === undefined) continue;
    next[name] = name === 'title' ? title(request[name]) : text(request[name]);
    if (name === 'title' && !next.title) invalid('A todo needs a non-empty title.', 'todo_title_required');
    changed = true;
  }
  if (request.status !== undefined) {
    if (!STATUSES.includes(request.status)) invalid('Unknown task status.');
    next.status = request.status;
    if (request.done !== undefined && request.done !== (next.status === 'done')) invalid('done and status disagree.');
    next.done = next.status === 'done';
    changed = true;
  } else if (request.done !== undefined) {
    if (typeof request.done !== 'boolean') invalid('done must be a boolean.');
    next.done = request.done;
    next.status = request.done ? 'done' : current.status === 'done' ? 'todo' : current.status;
    changed = true;
  }
  for (const [name, normalize] of [['tags', normalizeTags], ['priority', normalizePriority], ['quadrant', normalizeQuadrant]]) {
    if (request[name] !== undefined) { next[name] = normalize(request[name]); changed = true; }
  }
  if (request.sessionId !== undefined) {
    next.sessionId = optionalString(request.sessionId);
    next.sessionTitle = next.sessionId ? optionalString(request.sessionTitle) : null;
    changed = true;
  } else if (request.sessionTitle !== undefined) {
    next.sessionTitle = next.sessionId ? optionalString(request.sessionTitle) : null;
    changed = true;
  }
  if (request.projectId !== undefined) { next.projectId = projectId(doc, request.projectId); changed = true; }
  for (const name of ['dueDate', 'plannedDate', 'followUpDate']) {
    if (request[name] !== undefined) { next[name] = date(request[name], name); changed = true; }
  }
  if (request.estimateMinutes !== undefined) { next.estimateMinutes = number(request.estimateMinutes, 'estimateMinutes'); changed = true; }
  if (request.today !== undefined || request.todayDate !== undefined) {
    next.todayDate = request.today === true ? dateKey(at, doc.settings.timezone) : request.today === false ? null : date(request.todayDate, 'todayDate');
    next.todayAt = next.todayDate === null ? null : next.todayDate === current.todayDate ? current.todayAt ?? at : at;
    changed = true;
  }
  if (!changed) invalid('Nothing to update: pass a field the todo carries.', 'todo_nothing_to_update');
  next.completedAt = next.done ? current.done ? current.completedAt : at : null;
  next.updatedAt = at;
  return next;
}

/** Apply a core operation to a cloned transaction document, or return null. */
export function applyWorkOperation(doc, request, { now: at }) {
  switch (request.op) {
    case 'add': {
      if (!title(request.title)) invalid('A todo needs a non-empty title.', 'todo_title_required');
      if (doc.items.length >= 100000) invalid('The workbench has reached its 100,000 task safety limit. Export and archive history before adding more.', 'todo_limit_reached');
      const initial = {
        ...migrateTask({ id: newId('todo'), title: request.title }, at),
        createdAt: at, updatedAt: at,
      };
      const item = taskPatch(doc, request, initial, at);
      doc.items.unshift(item);
      recordTaskEvent(doc, item.done ? 'completed' : 'created', null, item, at, request.source);
      return { changed: true, data: { item } };
    }
    case 'update': {
      const before = task(doc, request.id);
      const next = taskPatch(doc, request, before, at);
      doc.items[doc.items.indexOf(before)] = next;
      const type = !before.done && next.done ? 'completed' : before.done && !next.done ? 'reopened' : 'updated';
      recordTaskEvent(doc, type, before, next, at, request.source);
      return { changed: true, data: { item: next } };
    }
    case 'remove':
    case 'archive':
    case 'restore': {
      const before = task(doc, request.id, request.op === 'restore');
      const next = { ...before, updatedAt: at };
      if (request.op === 'remove') next.deletedAt = at;
      if (request.op === 'archive') next.archivedAt = at;
      if (request.op === 'restore') { next.deletedAt = null; next.archivedAt = null; }
      doc.items[doc.items.indexOf(before)] = next;
      recordTaskEvent(doc, { remove: 'deleted', archive: 'archived', restore: 'restored' }[request.op], before, next, at, request.source);
      return { changed: true, data: { item: next } };
    }
    case 'clearDone': {
      const ids = [];
      for (const before of [...doc.items]) {
        if (!before.done || before.archivedAt || before.deletedAt) continue;
        const next = { ...before, archivedAt: at, updatedAt: at };
        doc.items[doc.items.indexOf(before)] = next;
        recordTaskEvent(doc, 'archived', before, next, at, request.source);
        ids.push(before.id);
      }
      return { changed: ids.length > 0, data: { archivedIds: ids, message: 'Completed tasks archived; history retained.' } };
    }
    case 'project.save': {
      const previous = request.id ? doc.projects.find((entry) => entry.id === request.id) : null;
      if (request.id && !previous) invalid('Project does not exist.', 'todo_not_found');
      const name = request.name === undefined && previous ? previous.name : title(request.name);
      if (!name) invalid('A project needs a name.');
      const status = request.status ?? previous?.status ?? 'active';
      if (!['active', 'paused', 'completed', 'archived'].includes(status)) invalid('Unknown project status.');
      const result = {
        ...previous, id: previous?.id ?? newId('project'), name,
        goal: request.goal === undefined ? previous?.goal ?? '' : text(request.goal),
        successCriteria: request.successCriteria === undefined ? previous?.successCriteria ?? '' : text(request.successCriteria),
        status, createdAt: previous?.createdAt ?? at, updatedAt: at,
      };
      if (previous) doc.projects[doc.projects.indexOf(previous)] = result;
      else doc.projects.push(result);
      return { changed: true, data: { project: result } };
    }
    case 'log.add': {
      const item = request.taskId ? task(doc, request.taskId) : null;
      const kind = request.kind ?? 'progress';
      if (!['progress', 'outcome', 'blocker', 'decision'].includes(kind)) invalid('Unknown work log kind.');
      const value = text(request.text, 10000);
      if (!value) invalid('A work log needs text.');
      const occurred = timestamp(request.time ?? request.at, 'time', at);
      if (occurred > at + 60_000) invalid('Work logs cannot occur in the future.');
      const effective = item ? [...doc.events].filter((event) => event.taskId === item.id && event.at <= occurred).sort((a, b) => a.at - b.at).at(-1)?.after : null;
      const source = effective ?? item;
      if (item && request.projectId !== undefined && projectId(doc, request.projectId) !== (source?.projectId ?? null)) invalid('The log project must match the task at the occurrence time.');
      const url = text(request.url, 2000);
      if (url) {
        try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) invalid('Only http(s) output links are accepted.'); }
        catch { invalid('Output link must be a valid http(s) URL.'); }
      }
      const result = {
        id: newId('log'), taskId: item?.id ?? null, taskTitle: source?.title ?? null,
        projectId: source?.projectId ?? projectId(doc, request.projectId), tags: clone(source?.tags ?? normalizeTags(request.tags)),
        kind, text: value, at: occurred, createdAt: at, minutes: number(request.minutes, 'minutes'), url: url || null,
      };
      doc.logs.push(result);
      return { changed: true, data: { log: result, warnings: result.minutes !== null && doc.focusSessions.some((entry) => entry.taskId === result.taskId && dateKey(entry.startedAt, doc.settings.timezone) === dateKey(occurred, doc.settings.timezone)) ? ['Manual minutes and focus time exist on the same day; check overlap before adding them.'] : [] } };
    }
    case 'plan.save': {
      const period = request.period ?? 'day';
      if (!['day', 'week'].includes(period)) invalid('Plan period must be day or week.');
      const day = date(request.date, 'date', true);
      const previous = request.id ? doc.plans.find((entry) => entry.id === request.id) : doc.plans.find((entry) => entry.period === period && entry.date === day);
      if (request.id && !previous) invalid('Plan does not exist.', 'todo_not_found');
      if (previous && (previous.period !== period || previous.date !== day)) invalid('An existing plan cannot move to another period.');
      if (!Array.isArray(request.taskIds) || request.taskIds.some((id) => typeof id !== 'string')) invalid('taskIds must be an array of task IDs.');
      const taskIds = [...new Set(request.taskIds)];
      taskIds.forEach((id) => {
        if (task(doc, id).archivedAt != null) invalid('Restore an archived task before adding it to a plan.');
      });
      const capacityMinutes = number(request.capacityMinutes, 'capacityMinutes', previous?.capacityMinutes ?? doc.settings.capacityMinutes, 10080);
      const bufferPercent = number(request.bufferPercent, 'bufferPercent', previous?.bufferPercent ?? doc.settings.bufferPercent, 95);
      const committed = previous?.committedAt !== null && previous?.committedAt !== undefined;
      const planTitle = request.title === undefined ? previous?.title ?? '' : text(request.title, 2000);
      const result = {
        ...previous, id: previous?.id ?? newId('plan'), period, date: day,
        title: planTitle, taskIds,
        capacityMinutes, bufferPercent, createdAt: previous?.createdAt ?? at, updatedAt: at,
        committedAt: committed ? previous.committedAt : request.commit === true ? at : null,
        baselineTaskIds: committed ? clone(previous.baselineTaskIds) : request.commit === true ? [...taskIds] : [],
        baselineTasks: committed ? clone(previous.baselineTasks ?? []) : request.commit === true ? taskIds.map((id) => clone(task(doc, id))) : [],
        history: [...(previous?.history ?? []), { at, taskIds, capacityMinutes, bufferPercent, title: planTitle }],
      };
      // Confirmed daily plans and task dates are one transaction. Drafts and
      // weekly commitments must not unexpectedly move tasks between days.
      if (period === 'day' && result.committedAt !== null) {
        const today = dateKey(at, doc.settings.timezone);
        const selected = new Set(taskIds);
        const removed = committed ? (previous.taskIds ?? []).filter((id) => !selected.has(id)) : [];
        for (const id of [...taskIds, ...removed]) {
          const before = doc.items.find((item) => item.id === id);
          if (!before || before.deletedAt || before.archivedAt) continue;
          const next = { ...before };
          if (selected.has(id)) {
            next.plannedDate = day;
            if (day === today) {
              next.todayDate = day;
              next.todayAt = before.todayDate === day ? before.todayAt ?? at : at;
            }
          } else {
            // A task may have been independently rescheduled since the plan
            // was confirmed. Removing it here cannot erase that newer date.
            if (before.plannedDate === day) next.plannedDate = null;
            if (before.todayDate === day) { next.todayDate = null; next.todayAt = null; }
          }
          if (next.plannedDate === before.plannedDate && next.todayDate === before.todayDate && next.todayAt === before.todayAt) continue;
          next.updatedAt = at;
          doc.items[doc.items.indexOf(before)] = next;
          const event = recordTaskEvent(doc, 'planned', before, next, at, request.source ?? 'plan');
          event.planId = result.id;
        }
        if (!committed) result.baselineTasks = taskIds.map((id) => clone(task(doc, id)));
      }
      if (previous) doc.plans[doc.plans.indexOf(previous)] = result;
      else doc.plans.push(result);
      return { changed: true, data: { plan: result } };
    }
    case 'focus.record': {
      // Deleting a task does not discard a focus interval already in progress.
      // Keep its historical attribution and allow the timer to finish saving.
      const item = task(doc, request.taskId, true);
      const startedAt = timestamp(request.startedAt, 'startedAt', null);
      const endedAt = timestamp(request.endedAt, 'endedAt', null);
      if (startedAt === null || endedAt === null || endedAt <= startedAt || endedAt > at + 60_000) invalid('A focus session needs a valid past start and end.');
      const pauseMinutes = number(request.pauseMinutes, 'pauseMinutes', 0);
      const elapsed = (endedAt - startedAt) / 60000;
      if (pauseMinutes > elapsed) invalid('Pause time exceeds the elapsed focus session.');
      const minutes = number(request.minutes, 'minutes', elapsed - pauseMinutes);
      if (minutes > elapsed - pauseMinutes) invalid('Focus minutes exceed elapsed time minus pauses.');
      if (request.clientId && doc.focusSessions.some((entry) => entry.clientId === request.clientId)) {
        return { changed: false, data: { focusSession: doc.focusSessions.find((entry) => entry.clientId === request.clientId), duplicate: true } };
      }
      if (item.deletedAt != null && startedAt >= item.deletedAt) invalid('A new focus session cannot start after its task was deleted.');
      if (doc.focusSessions.some((entry) => entry.startedAt < endedAt && entry.endedAt > startedAt)) invalid('This focus interval overlaps an existing record.', 'todo_time_overlap');
      const effective = [...doc.events].filter((event) => event.taskId === item.id && event.at <= startedAt).sort((a, b) => a.at - b.at).at(-1)?.after ?? item;
      const result = {
        id: newId('focus'), clientId: optionalString(request.clientId), taskId: item.id, taskTitle: effective.title,
        projectId: effective.projectId, tags: clone(effective.tags), startedAt, endedAt, pauseMinutes,
        minutes, interrupted: request.interrupted === true, createdAt: at,
      };
      doc.focusSessions.push(result);
      return { changed: true, data: { focusSession: result } };
    }
    case 'settings.update': {
      const result = { ...doc.settings };
      if (request.timezone !== undefined) result.timezone = timezone(request.timezone);
      if (request.weekStartsOn !== undefined) {
        if (!Number.isInteger(request.weekStartsOn) || request.weekStartsOn < 0 || request.weekStartsOn > 6) invalid('weekStartsOn must be 0–6.');
        result.weekStartsOn = request.weekStartsOn;
      }
      if (request.capacityMinutes !== undefined) result.capacityMinutes = number(request.capacityMinutes, 'capacityMinutes', 360, 1440);
      if (request.bufferPercent !== undefined) result.bufferPercent = number(request.bufferPercent, 'bufferPercent', 30, 95);
      doc.settings = result;
      return { changed: true, data: { settings: result } };
    }
    default: return null;
  }
}
