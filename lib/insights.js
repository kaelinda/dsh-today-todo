/** Deterministic facts, editable documents, planning feedback and recurring drafts. */
import { randomUUID } from 'node:crypto';
import {
  addDays, calendarPeriod, dateParts, dayStart, routinePeriod, routinePreview,
  dueRoutineOccurrences, validTimezone, zonedDateKey,
} from './calendar.js';

export { routinePeriod, routinePreview, dueRoutineOccurrences } from './calendar.js';

const clone = (value) => structuredClone(value);
const id = (prefix) => `${prefix}-${randomUUID()}`;
const reportKinds = ['daily', 'weekly', 'monthly'];
const own = (object, field) => Object.prototype.hasOwnProperty.call(object, field);
const statusOf = (item) => item?.status || (item?.done ? 'done' : 'todo');
function fail(message, code = 'todo_bad_request') { const error = new Error(message); error.code = code; throw error; }
function text(value, label, max = 200, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`${label} must be ${required ? 'non-empty ' : ''}text up to ${max} characters.`);
  return value.trim();
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}
function timeValue(value, label) {
  const at = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(at)) fail(`${label} must be a timestamp.`);
  return at;
}
function nowValue(context) { return timeValue(typeof context.now === 'function' ? context.now() : context.now ?? Date.now(), 'now'); }
function ensure(document) {
  for (const collection of ['items', 'projects', 'events', 'logs', 'plans', 'focusSessions', 'routines', 'runs', 'documents']) {
    if (!Array.isArray(document[collection])) document[collection] = [];
  }
  document.settings ??= { timezone: 'UTC', weekStartsOn: 1, capacityMinutes: 360, bufferPercent: 30 };
}
function scopeOf(document, request) {
  const projectIds = request.projectIds ?? [];
  if (!Array.isArray(projectIds) || projectIds.length > 100 || projectIds.some((projectId) => typeof projectId !== 'string')) fail('projectIds must be an array of project IDs.');
  for (const projectId of projectIds) {
    if (!document.projects.some((project) => project.id === projectId)) fail(`Project does not exist: ${projectId}`, 'todo_not_found');
  }
  const tags = request.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 8 || tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 24)) fail('tags must contain up to eight tags of at most 24 characters.');
  return { projectIds: [...new Set(projectIds)], tags: [...new Set(tags.map((tag) => tag.replace(/^#/, '').trim().toLowerCase()))] };
}

function eventItem(event) { return event.after || event.item || null; }
function attribution(record) {
  const item = eventItem(record);
  return {
    projectId: own(record, 'projectId') ? record.projectId : item?.projectId ?? null,
    tags: own(record, 'tags') ? record.tags : item?.tags ?? [],
  };
}
function matches(record, scope) {
  const attributionValue = attribution(record);
  return (!scope.projectIds.length || scope.projectIds.includes(attributionValue.projectId))
    && (!scope.tags.length || (attributionValue.tags || []).some((tag) => scope.tags.includes(tag.toLowerCase())));
}

function stateMapAt(document, at) {
  const map = new Map();
  const recordedIds = new Set(document.events.map((event) => event.taskId));
  for (const event of [...document.events].sort((a, b) => a.at - b.at)) {
    if (event.at >= at) continue;
    const item = eventItem(event);
    if (item) map.set(event.taskId || item.id, item);
  }
  // Legacy records with no event have no reconstructable historical completion.
  // Their current snapshot is useful only when it predates the requested cutoff.
  for (const item of document.items) {
    if (!map.has(item.id) && !recordedIds.has(item.id)
      && item.createdAt < at && item.updatedAt < at) map.set(item.id, item);
  }
  return map;
}

function windowOf(document, request, now) {
  const timezone = request.timezone || document.settings.timezone || 'UTC';
  if (!validTimezone(timezone)) fail(`Invalid timezone: ${timezone}`);
  const kind = request.kind || 'weekly';
  if (!reportKinds.includes(kind)) fail('Report kind must be daily, weekly or monthly.');
  const defaults = calendarPeriod(kind, now, { timezone, weekStartsOn: document.settings.weekStartsOn ?? 1 });
  const startDate = request.startDate || defaults.startDate;
  const endDate = request.endDate || defaults.endDate;
  dateParts(startDate); dateParts(endDate);
  if (startDate >= endDate) fail('The report end date must be after its start date (end is exclusive).');
  const periodStart = dayStart(startDate, timezone);
  const periodEnd = dayStart(endDate, timezone);
  if (periodEnd - periodStart > 3 * 366 * 86_400_000) fail('A report can cover at most three years.');
  if (periodStart > now) fail('A report cannot start in the future.');
  return { kind, startDate, endDate, timezone, periodStart, periodEnd, asOf: Math.min(now, periodEnd), partial: now < periodEnd };
}

/** Aggregate original records; project reports are never used as statistical inputs. */
export function aggregateFacts(document, request = {}, context = {}) {
  ensure(document);
  const now = nowValue(context);
  const window = windowOf(document, request, now);
  const scope = scopeOf(document, request);
  const cutoff = Math.min(window.periodEnd, now + 1);
  const inWindow = (at) => at >= window.periodStart && at < cutoff;
  const events = document.events.filter((event) => inWindow(event.at));
  const scopedEvents = events.filter((event) => matches(event, scope));
  const closingState = stateMapAt(document, cutoff);
  const completionByTask = new Map();
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    const after = eventItem(event);
    const completed = event.type === 'completed'
      || (event.type !== 'imported' && after?.completedAt != null && statusOf(after) === 'done' && statusOf(event.before) !== 'done');
    if (completed && statusOf(closingState.get(event.taskId)) === 'done') {
      completionByTask.set(event.taskId, {
        taskId: event.taskId, title: after?.title || event.before?.title || '未命名任务',
        projectId: attribution(event).projectId, tags: attribution(event).tags,
        completedAt: event.at, sourceId: event.id,
      });
    }
  }
  // Decide the one final completion globally before applying project/tag scope.
  // Otherwise a task completed in A, reopened and completed in B appears in both.
  const completed = [...completionByTask.values()].filter((entry) => matches(entry, scope));
  const reopened = [...new Map(scopedEvents.filter((event) => event.type === 'reopened'
    || (event.before && statusOf(event.before) === 'done' && statusOf(eventItem(event)) !== 'done'))
    .map((event) => [event.taskId, { taskId: event.taskId, title: eventItem(event)?.title || event.before?.title,
      projectId: attribution(event).projectId, at: event.at, sourceId: event.id }])).values()];
  const logs = document.logs.filter((log) => inWindow(log.at) && matches(log, scope)
    && ['progress', 'outcome', 'blocker', 'decision'].includes(log.kind)).map((log) => ({
    id: log.id, taskId: log.taskId ?? null, projectId: log.projectId ?? null, tags: clone(log.tags || []),
    kind: log.kind, at: log.at, text: log.text, url: log.url || null, minutes: log.minutes ?? null,
  }));
  const focus = document.focusSessions.filter((session) => session.endedAt > window.periodStart
    && session.startedAt < window.asOf && matches(session, scope)).map((session) => {
    const elapsed = session.endedAt - session.startedAt;
    const overlap = Math.max(0, Math.min(session.endedAt, window.asOf) - Math.max(session.startedAt, window.periodStart));
    const ratio = elapsed > 0 ? overlap / elapsed : 0;
    return { id: session.id, taskId: session.taskId, projectId: session.projectId ?? null,
      minutes: Math.round(Number(session.minutes ?? session.effectiveMinutes ?? 0) * ratio * 10) / 10,
      approximate: ratio !== 1 && Number(session.pauseMinutes || 0) > 0 };
  });
  const blocked = [...closingState.values()].filter((item) => !item.deletedAt && statusOf(item) === 'waiting' && matches(item, scope))
    .map((item) => ({ taskId: item.id, title: item.title, projectId: item.projectId ?? null, waitingFor: item.waitingFor || '', followUpDate: item.followUpDate || null }));
  const next = [...closingState.values()].filter((item) => !item.deletedAt && !item.archivedAt && !['done', 'cancelled'].includes(statusOf(item))
    && item.plannedDate >= window.endDate && matches(item, scope)).map((item) => ({ taskId: item.id, title: item.title, projectId: item.projectId ?? null, plannedDate: item.plannedDate }));
  const plans = document.plans.filter((plan) => plan.date >= window.startDate && plan.date < window.endDate && plan.createdAt < cutoff).map((plan) => {
    const planCutoff = Math.min(cutoff, dayStart(addDays(plan.date, plan.period === 'week' ? 7 : 1), window.timezone));
    const history = [...(plan.history || [])].filter((entry) => entry.at < planCutoff).sort((a, b) => a.at - b.at).at(-1);
    const atPlanEnd = stateMapAt(document, planCutoff);
    const baseline = plan.committedAt && plan.committedAt < planCutoff
      ? (plan.baselineTasks || []).filter((item) => matches(item, scope)) : [];
    const taskIds = (history?.taskIds || plan.taskIds || []).filter((taskId) => {
      const item = atPlanEnd.get(taskId);
      return item && matches(item, scope);
    });
    return { id: plan.id, date: plan.date, period: plan.period, title: history?.title ?? plan.title,
      committedAt: plan.committedAt < planCutoff ? plan.committedAt : null,
      baselineTaskIds: baseline.map((item) => item.id), baselineTitles: baseline.map((item) => item.title),
      completedCount: baseline.filter((item) => statusOf(atPlanEnd.get(item.id)) === 'done').length,
      insertedTaskIds: taskIds.filter((taskId) => !baseline.some((item) => item.id === taskId)),
      removedTaskIds: baseline.filter((item) => !taskIds.includes(item.id)).map((item) => item.id) };
  }).filter((plan) => !scope.projectIds.length && !scope.tags.length || plan.baselineTaskIds.length || plan.insertedTaskIds.length);
  const projectNames = Object.fromEntries(document.projects.map((project) => [project.id, project.name]));
  projectNames.unassigned = '未归属项目';
  const groupIds = new Set([...completed, ...logs, ...focus, ...blocked, ...next].map((entry) => entry.projectId || 'unassigned'));
  const groups = [...groupIds].map((projectId) => ({
    projectId: projectId === 'unassigned' ? null : projectId, name: projectNames[projectId] || projectId,
    completed: completed.filter((entry) => (entry.projectId || 'unassigned') === projectId).length,
    focusMinutes: Math.round(focus.filter((entry) => (entry.projectId || 'unassigned') === projectId).reduce((sum, entry) => sum + entry.minutes, 0) * 10) / 10,
    manualMinutes: logs.filter((entry) => (entry.projectId || 'unassigned') === projectId).reduce((sum, entry) => sum + Number(entry.minutes || 0), 0),
  }));
  const sourceRefs = [
    ...scopedEvents.map((event) => ({ collection: 'events', id: event.id, at: event.at, type: event.type, taskId: event.taskId })),
    ...logs.map((log) => ({ collection: 'logs', id: log.id, at: log.at, type: log.kind, taskId: log.taskId })),
    ...focus.map((session) => ({ collection: 'focusSessions', id: session.id, taskId: session.taskId })),
    ...plans.map((plan) => ({ collection: 'plans', id: plan.id, at: plan.committedAt })),
  ];
  return { ...window, ...scope, generatedAt: now, dataRevision: document.revision, completed, reopened, logs, focus, blocked, next, plans,
    groups, projectNames, sourceRefs, activityCount: scopedEvents.filter((event) => event.type !== 'imported').length + logs.length,
    completedCount: completed.length, focusMinutes: focus.reduce((sum, entry) => sum + entry.minutes, 0),
    manualMinutes: logs.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0) };
}

const md = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]<>#|]/g, '\\$&');
function list(rows, empty = '本期没有记录到相关活动。') { return rows.length ? rows.map((row) => `- ${row}`).join('\n') : `- ${empty}`; }
function scopeLabel(facts) { return facts.projectIds.length ? facts.projectIds.map((projectId) => facts.projectNames[projectId] || projectId).join('、') : '所有项目（含未归属）'; }
function projectLabel(facts, projectId) { return facts.projectNames[projectId || 'unassigned'] || projectId; }

export function renderReport(facts, { title = '工作报告', template = '' } = {}) {
  const sections = [
    `# ${md(title)}`,
    `范围：${md(scopeLabel(facts))}；周期：${facts.startDate} 至 ${facts.endDate}（结束日期不含当天）；时区：${facts.timezone}。`,
    facts.partial ? `本周期尚未结束，以下为截至 ${new Date(facts.asOf).toISOString()} 的草稿。` : '本报告覆盖已结束的完整区间。',
    '## 本期结果',
    list(facts.completed.map((entry) => `${md(entry.title)}（${md(projectLabel(facts, entry.projectId))}）`), '没有可核实的本期新完成记录。'),
    '## 关键进展与产出',
    list(facts.logs.filter((entry) => entry.kind !== 'blocker').map((entry) => `${md(entry.text)}（${md(projectLabel(facts, entry.projectId))}）${entry.url ? ` · ${md(entry.url)}` : ''}`)),
    '## 风险与待协助事项',
    list([...facts.logs.filter((entry) => entry.kind === 'blocker').map((entry) => `记录的阻塞：${md(entry.text)}`),
      ...facts.blocked.map((entry) => `${md(entry.title)}：等待 ${md(entry.waitingFor || '补充等待事项')}${entry.followUpDate ? `，跟进日 ${entry.followUpDate}` : ''}`),
      ...facts.reopened.map((entry) => `本期重开：${md(entry.title)}；请核对返工状态。`)], '没有记录到阻塞；不代表没有风险。'),
    '## 下期计划',
    list(facts.next.map((entry) => `${entry.plannedDate}：${md(entry.title)}`), '尚未记录下一期安排，待补充。'),
    '## 投入记录',
    list(facts.groups.map((group) => `${md(group.name)}：新完成 ${group.completed} 项；记录专注 ${group.focusMinutes} 分钟；手工记录 ${group.manualMinutes} 分钟。`)),
    '专注与手工投入分列，未直接相加；记录时长不代表全部工时或业务产出。',
  ];
  if (template) sections.push('## 自定义补充提示', template, '待补充。');
  return `${sections.join('\n\n')}\n`;
}

function previousActions(document, facts) {
  return document.documents.filter((entry) => entry.type === 'review' && entry.createdAt < facts.generatedAt && entry.startDate < facts.startDate)
    .flatMap((entry) => (entry.actions || []).map((action) => ({ ...action, reviewId: entry.id })))
    .filter((action) => !facts.projectIds.length || facts.projectIds.includes(action.projectId))
    .map((action) => ({ ...action, status: statusOf(document.items.find((task) => task.id === action.taskId)) }));
}

export function renderReview(facts, document, { title = '工作复盘', template = '' } = {}) {
  const actions = previousActions(document, facts);
  const lines = [
    `# ${md(title)}`,
    `范围：${md(scopeLabel(facts))}；周期：${facts.startDate} 至 ${facts.endDate}（结束日期不含当天）；时区：${facts.timezone}。`,
    '以下事实与问题用于核对预期、实际与下一步调整；原因由自己结合证据判断。',
    facts.partial ? `本周期尚未结束，事实截至 ${new Date(facts.asOf).toISOString()}。` : '事实覆盖已结束的完整区间。',
    '## 先检查上次的改进行动',
    list(actions.map((action) => `${md(action.title)}：${action.status === 'done' ? '已完成' : '仍需检查'}${action.successCriteria ? `；验证标准：${md(action.successCriteria)}` : ''}`), '没有更早周期的改进行动。'),
    '## 事实对照',
    `本期可核实新完成 ${facts.completedCount} 项；记录进展 / 产出 / 阻塞 ${facts.logs.length} 条；重开 ${facts.reopened.length} 项。`,
    list(facts.logs.map((entry) => `${md(entry.text)}（${md(projectLabel(facts, entry.projectId))}）`)),
    '## 原计划与实际',
    list(facts.plans.map((plan) => `${plan.date} ${plan.period === 'week' ? '周' : '日'}计划${plan.title ? `：${md(plan.title)}` : ''}；${plan.committedAt ? `首次确认 ${plan.baselineTaskIds.length} 项，周期末完成 ${plan.completedCount} 项，后来加入 ${plan.insertedTaskIds.length} 项、撤回 ${plan.removedTaskIds.length} 项。` : '未确认初始计划，不计算兑现率。'}`), '未记录这一周期的计划，先补充原来的预期。'),
    '## 预期是什么？实际发生了什么？',
    '待补充：对照原目标、计划与临时插入的工作，写下最有价值的推进和差距。',
    '## 为什么有差异？',
    '待补充：有哪些证据？原因暂作假设，哪些还需要验证？',
    '## 下一周期如何调整？',
    '待补充：选 1–3 个可执行的改进行动，写明下一步、检查日期和成功标准。',
  ];
  if (template) lines.push('## 自定义复盘问题', template);
  return `${lines.join('\n\n')}\n`;
}

function documentById(document, documentId) {
  const record = document.documents.find((entry) => entry.id === documentId);
  if (!record) fail('The report or review does not exist.', 'todo_not_found');
  return record;
}

function appendRevision(record, { content, facts, source, status, now, activate = true }) {
  if ((record.revisions || []).length >= 1000) fail('This document already has 1,000 revisions. Export or create a new document.');
  const revision = { id: id('revision'), at: now, source, content, status, facts: clone(facts || record.facts) };
  record.revisions ??= [];
  record.revisions.push(revision);
  record.updatedAt = now;
  if (activate) {
    record.content = content;
    record.status = status;
    record.facts = clone(revision.facts);
    record.currentRevisionId = revision.id;
    record.candidateRevisionId = null;
  } else record.candidateRevisionId = revision.id;
  return revision;
}

function generate(document, request, now, type) {
  const existing = request.documentId ? documentById(document, request.documentId) : null;
  if (existing && existing.type !== type) fail('Document type cannot be changed.');
  if (existing) {
    for (const field of ['kind', 'startDate', 'endDate', 'timezone', 'title']) {
      if (request[field] !== undefined && request[field] !== existing[field]) fail('A document keeps its original period, title and scope. Create a new document to change them.');
    }
    const requestedScope = scopeOf(document, { projectIds: request.projectIds ?? existing.projectIds, tags: request.tags ?? existing.tags });
    for (const field of ['projectIds', 'tags']) {
      if (JSON.stringify([...requestedScope[field]].sort()) !== JSON.stringify([...existing[field]].sort())) fail('A document keeps its original project and tag scope. Create a new document to change it.');
    }
  }
  const input = existing ? { ...existing, ...request } : request;
  const facts = aggregateFacts(document, input, { now });
  const label = { daily: '日报', weekly: '周报', monthly: '月报' }[facts.kind];
  const title = text(input.title || `${facts.startDate} ${type === 'review' ? `${label.slice(0, 1)}复盘` : label}`, 'title');
  const template = text(input.template || '', 'template', 5000, false);
  const content = type === 'review' ? renderReview(facts, document, { title, template }) : renderReport(facts, { title, template });
  const record = existing || { id: id(type), type, kind: facts.kind, title, startDate: facts.startDate, endDate: facts.endDate,
    timezone: facts.timezone, projectIds: facts.projectIds, tags: facts.tags, template, createdAt: now, actions: [], revisions: [] };
  const revision = appendRevision(record, { content, facts, source: 'generated', status: type === 'review' ? 'pending' : 'draft', now, activate: !existing });
  if (!existing) document.documents.push(record);
  return { document: clone(record), revision: clone(revision), preservedCurrent: Boolean(existing) };
}

function normalizeRoutine(document, request, now) {
  const existing = request.id ? document.routines.find((entry) => entry.id === request.id) : null;
  if (request.id && !existing) fail('Routine does not exist.', 'todo_not_found');
  const value = { ...existing, ...request };
  const kind = value.kind || 'report';
  if (!['report', 'review'].includes(kind)) fail('Routine kind must be report or review.');
  const reportKind = value.reportKind || 'weekly';
  if (!reportKinds.includes(reportKind)) fail('Routine reportKind must be daily, weekly or monthly.');
  const frequency = value.frequency || 'weekly';
  if (!['daily', 'weekly', 'monthly', 'interval'].includes(frequency)) fail('Unsupported routine frequency.');
  const timezone = value.timezone || document.settings.timezone || 'UTC';
  if (!validTimezone(timezone)) fail(`Invalid timezone: ${timezone}`);
  const time = value.time || '09:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Routine time must be HH:mm.');
  const anchorDate = value.anchorDate || zonedDateKey(now, timezone);
  dateParts(anchorDate);
  const weekdays = value.weekdays ?? [1];
  if (!Array.isArray(weekdays) || !weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) fail('Select at least one weekday (0–6).');
  const interval = integer(value.interval ?? 1, 'interval', 1, 365);
  const unit = value.unit || 'day';
  if (!['day', 'week'].includes(unit)) fail('Interval unit must be day or week.');
  const monthDay = value.monthDay ?? 1;
  if (monthDay !== 'last') integer(monthDay, 'monthDay', 1, 31);
  const coverage = value.coverage || (frequency === 'interval' ? 'rolling' : 'previous');
  if (!['previous', 'current', 'rolling'].includes(coverage)) fail('Coverage must be previous, current or rolling.');
  const mode = value.mode || 'draft';
  if (!['draft', 'remind'].includes(mode)) fail('Routine mode must be draft or remind.');
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') fail('enabled must be boolean.');
  const enabled = value.enabled ?? true;
  const normalized = { id: existing?.id || id('routine'), name: text(value.name || `${kind === 'review' ? '复盘' : '报告'}计划`, 'name'),
    kind, reportKind, ...scopeOf(document, value), template: text(value.template || '', 'template', 5000, false),
    frequency, interval, unit, weekdays: [...new Set(weekdays)].sort(), monthDay, time, timezone, anchorDate,
    // Keep the rolling-window default aligned with the routine editor; it is
    // intentionally independent of the interval between trigger occurrences.
    coverage, windowDays: integer(value.windowDays ?? 7, 'windowDays', 1, 1095), mode, enabled,
    createdAt: existing?.createdAt ?? now, updatedAt: now,
    enabledAt: enabled && !existing?.enabled ? now : existing?.enabledAt ?? now,
  };
  const timingFields = ['frequency', 'interval', 'unit', 'weekdays', 'monthDay', 'time', 'timezone', 'anchorDate', 'coverage', 'windowDays', 'reportKind'];
  if (existing && timingFields.some((field) => JSON.stringify(normalized[field]) !== JSON.stringify(existing[field]))) normalized.enabledAt = now;
  return normalized;
}

function runRoutine(document, request, now, skip = false) {
  const routine = document.routines.find((entry) => entry.id === request.id);
  if (!routine) fail('Routine does not exist.', 'todo_not_found');
  const defaultSkippedOccurrence = skip ? dueRoutineOccurrences(document, now).find((entry) => entry.routineId === routine.id)
    || routinePreview(routine, now, 1, document.settings)[0] : null;
  const scheduledAt = request.scheduledAt !== undefined ? timeValue(request.scheduledAt, 'scheduledAt') : defaultSkippedOccurrence?.scheduledAt ?? now;
  if (scheduledAt > now && !skip) fail('A future routine occurrence cannot run yet.');
  const period = routinePeriod(routine, scheduledAt, document.settings);
  if (request.periodStart !== undefined || request.periodEnd !== undefined) {
    if (request.periodStart === undefined || request.periodEnd === undefined) fail('Both period boundaries are required.');
    const requestedStart = timeValue(request.periodStart, 'periodStart');
    const requestedEnd = timeValue(request.periodEnd, 'periodEnd');
    if (requestedStart !== period.periodStart || requestedEnd !== period.periodEnd) fail('Period boundaries must match this scheduled occurrence.');
  }
  let run = document.runs.find((entry) => entry.routineId === routine.id && entry.periodStart === period.periodStart && entry.periodEnd === period.periodEnd);
  if (run && ['completed', 'reminder', 'skipped'].includes(run.status)) return { changed: false, data: { run: clone(run), duplicate: true, document: run.documentId ? clone(documentById(document, run.documentId)) : null } };
  if (!run) {
    const missed = dueRoutineOccurrences(document, now).find((entry) => entry.routineId === routine.id && entry.scheduledAt === scheduledAt);
    run = { id: id('run'), routineId: routine.id, key: `${routine.id}/${period.periodStart}/${period.periodEnd}`, ...period,
      scheduledAt, createdAt: now, scope: clone({ projectIds: routine.projectIds, tags: routine.tags }), routineSnapshot: clone(routine), attempts: 0,
      olderMissed: missed?.olderMissed || 0 };
    document.runs.push(run);
  }
  run.attempts += 1;
  run.updatedAt = now;
  if (skip || run.routineSnapshot.mode === 'remind') {
    run.status = skip ? 'skipped' : 'reminder';
    run.completedAt = now;
    return { changed: true, data: { run: clone(run) } };
  }
  const snapshot = run.routineSnapshot;
  const generated = generate(document, { kind: snapshot.reportKind, startDate: run.startDate, endDate: run.endDate,
    timezone: run.timezone, ...run.scope, template: snapshot.template, title: `${snapshot.name} · ${run.startDate}` }, now, snapshot.kind);
  run.documentId = generated.document.id;
  run.status = 'completed';
  run.completedAt = now;
  run.error = null;
  return { changed: true, data: { run: clone(run), ...generated } };
}

/** Explanations refer to actual records, never opaque productivity scores. */
export function planningInsights(document, { date, now = Date.now() } = {}) {
  ensure(document);
  const day = date || zonedDateKey(now, document.settings.timezone || 'UTC');
  dateParts(day);
  const plan = document.plans.find((entry) => entry.period === 'day' && entry.date === day);
  const liveItems = document.items.filter((item) => !item.archivedAt && !item.deletedAt && !['done', 'cancelled'].includes(statusOf(item)));
  const selected = liveItems.filter((item) => plan ? (plan.taskIds || []).includes(item.id) : item.todayDate === day || item.plannedDate === day);
  const capacityMinutes = plan?.capacityMinutes ?? document.settings.capacityMinutes ?? 360;
  const bufferPercent = plan?.bufferPercent ?? document.settings.bufferPercent ?? 30;
  const budgetMinutes = Math.round(capacityMinutes * (1 - bufferPercent / 100));
  const estimatedMinutes = selected.reduce((sum, item) => sum + Number(item.estimateMinutes || 0), 0);
  const unestimatedCount = selected.filter((item) => item.estimateMinutes == null).length;
  const baseline = plan?.committedAt ? (plan.baselineTaskIds || plan.taskIds || []) : [];
  const closingState = stateMapAt(document, Math.min(now + 1, dayStart(addDays(day, 1), document.settings.timezone || 'UTC')));
  const completedCount = baseline.filter((taskId) => statusOf(closingState.get(taskId)) === 'done').length;
  const suggestions = [];
  if (estimatedMinutes > budgetMinutes) suggestions.push({ kind: 'capacity', severity: 'warning', text: `已安排 ${estimatedMinutes} 分钟，超过含缓冲容量 ${budgetMinutes} 分钟；建议改期或拆分。`, taskIds: selected.map((item) => item.id) });
  if (unestimatedCount) suggestions.push({ kind: 'estimate', severity: 'info', text: `${unestimatedCount} 个已选任务尚未估时，当前总量并非完整负荷。`, taskIds: selected.filter((item) => item.estimateMinutes == null).map((item) => item.id) });
  const q2 = liveItems.filter((item) => item.quadrant === 'q2' && !item.plannedDate && item.todayDate !== day);
  if (q2.length) suggestions.push({ kind: 'q2', severity: 'info', text: `${q2.length} 个重要不紧急任务尚未安排日期。`, taskIds: q2.map((item) => item.id) });
  const overdue = liveItems.filter((item) => item.dueDate && item.dueDate < day);
  if (overdue.length) suggestions.push({ kind: 'overdue', severity: 'warning', text: `${overdue.length} 个任务已过截止日；请核对紧急程度与下一步。`, taskIds: overdue.map((item) => item.id) });
  const carrying = liveItems.filter((item) => (item.todayDate && item.todayDate < day) || (item.plannedDate && item.plannedDate < day));
  if (carrying.length) suggestions.push({ kind: 'replan', severity: 'info', text: `${carrying.length} 个旧计划任务等待重排，不会自动挤入今天。`, taskIds: carrying.map((item) => item.id) });
  const doing = liveItems.filter((item) => statusOf(item) === 'doing');
  if (doing.length > 3) suggestions.push({ kind: 'wip', severity: 'warning', text: `同时进行中 ${doing.length} 项，建议先收敛到 1–3 项。`, taskIds: doing.map((item) => item.id) });
  const postponed = new Map();
  for (const event of document.events) {
    if (event.before?.plannedDate && eventItem(event)?.plannedDate > event.before.plannedDate) {
      const listValue = postponed.get(event.taskId) || []; listValue.push(event.id); postponed.set(event.taskId, listValue);
    }
  }
  for (const [taskId, sourceIds] of postponed) {
    const task = liveItems.find((item) => item.id === taskId);
    if (task && sourceIds.length >= 2) suggestions.push({ kind: 'postponed', severity: 'info', text: `“${task.title}”已改期 ${sourceIds.length} 次，建议检查范围、依赖或估时。`, taskIds: [taskId], sourceIds });
  }
  const blocks = new Map();
  for (const log of document.logs.filter((entry) => entry.kind === 'blocker' && entry.taskId && now - entry.at <= 28 * 86_400_000)) {
    const values = blocks.get(log.taskId) || []; values.push(log.id); blocks.set(log.taskId, values);
  }
  for (const [taskId, sourceIds] of blocks) {
    if (sourceIds.length >= 2) suggestions.push({ kind: 'blocker', severity: 'info', text: `同一任务近四周记录 ${sourceIds.length} 次阻塞，请核对是否存在共同原因。`, taskIds: [taskId], sourceIds });
  }
  const samples = document.items.filter((item) => statusOf(item) === 'done' && Number(item.estimateMinutes) > 0).map((item) => {
    const sessions = document.focusSessions.filter((session) => session.taskId === item.id);
    const actual = sessions.reduce((sum, session) => sum + Number(session.minutes ?? session.effectiveMinutes ?? 0), 0);
    return { taskId: item.id, ratio: actual / item.estimateMinutes, sourceIds: sessions.map((session) => session.id) };
  }).filter((entry) => entry.ratio > 0);
  if (samples.length >= 3) {
    const sorted = samples.map((entry) => entry.ratio).sort((a, b) => a - b);
    const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    suggestions.push({ kind: 'calibration', severity: 'info', text: `${samples.length} 个已完成任务的记录专注 / 估时中位数为 ${median.toFixed(1)} 倍。记录可能不完整，仅作下次估时参考。`, sampleSize: samples.length, ratio: median, taskIds: samples.map((entry) => entry.taskId), sourceIds: samples.flatMap((entry) => entry.sourceIds) });
  }
  return { date: day, capacityMinutes, bufferPercent, budgetMinutes, estimatedMinutes, unestimatedCount,
    committedCount: baseline.length, completedCount, fulfillmentRate: baseline.length ? completedCount / baseline.length : null,
    insertedTaskIds: plan?.committedAt ? (plan.taskIds || []).filter((taskId) => !baseline.includes(taskId)) : [],
    removedTaskIds: plan?.committedAt ? baseline.filter((taskId) => !(plan.taskIds || []).includes(taskId)) : [], suggestions };
}

/** Called inside the store's transaction. No I/O, network or model call is performed here. */
export function applyInsightOperation(document, request, context = {}) {
  const operations = ['report.generate', 'review.generate', 'document.save', 'document.restore', 'document.get',
    'review.action', 'routine.save', 'routine.preview', 'routine.run', 'routine.skip', 'routine.snooze', 'routine.generate', 'insights'];
  if (!operations.includes(request?.op)) return null;
  ensure(document);
  const now = nowValue(context);
  if (request.op === 'insights') return { changed: false, data: planningInsights(document, { date: request.date, now }) };
  if (request.op === 'document.get') return { changed: false, data: { document: clone(documentById(document, request.id)) } };
  if (request.op === 'report.generate' || request.op === 'review.generate') {
    return { changed: true, data: generate(document, request, now, request.op.startsWith('review') ? 'review' : 'report') };
  }
  if (request.op === 'document.save') {
    const record = documentById(document, request.id);
    const status = request.status || (record.type === 'review' ? 'pending' : 'draft');
    if (!['draft', 'final', 'pending'].includes(status)) fail('Document status must be draft, pending or final.');
    if (request.baseRevisionId !== undefined && record.currentRevisionId !== request.baseRevisionId) fail('This document changed; reload before saving.', 'todo_revision_conflict');
    const content = text(request.content, 'content', 100_000);
    const revision = appendRevision(record, { content, source: 'manual', status, now });
    return { changed: true, data: { document: clone(record), revision: clone(revision) } };
  }
  if (request.op === 'document.restore') {
    const record = documentById(document, request.id);
    if (request.baseRevisionId !== record.currentRevisionId) fail('This document changed; reload before restoring a revision.', 'todo_revision_conflict');
    const source = record.revisions.find((revision) => revision.id === request.revisionId);
    if (!source) fail('Document revision does not exist.', 'todo_not_found');
    const revision = appendRevision(record, { content: source.content, facts: source.facts, source: 'restored', status: record.type === 'review' ? 'pending' : 'draft', now });
    return { changed: true, data: { document: clone(record), revision: clone(revision) } };
  }
  if (request.op === 'review.action') {
    const record = documentById(document, request.documentId);
    if (record.type !== 'review') fail('Actions can only be attached to a review.');
    const projectId = request.projectId || null;
    if (projectId && !document.projects.some((project) => project.id === projectId)) fail('Project does not exist.', 'todo_not_found');
    const dueDate = request.dueDate || request.checkDate || null;
    if (dueDate) dateParts(dueDate);
    const task = { id: id('todo'), title: text(request.title, 'title'), description: text(request.successCriteria || '', 'successCriteria', 2000, false),
      projectId, status: 'todo', done: false, createdAt: now, updatedAt: now, completedAt: null,
      priority: null, quadrant: 'q2', tags: ['复盘行动'], dueDate, plannedDate: null, estimateMinutes: null,
      todayDate: null, todayAt: null, archivedAt: null, deletedAt: null, sessionId: null, sessionTitle: null,
      waitingFor: '', followUpDate: null, reviewId: record.id };
    document.items.push(task);
    document.events.push({ id: id('event'), type: 'created', at: now, taskId: task.id, projectId, tags: [...task.tags], before: null, after: clone(task), item: clone(task), source: 'review' });
    const action = { taskId: task.id, title: task.title, projectId, checkDate: dueDate, successCriteria: task.description, createdAt: now };
    record.actions.push(action);
    record.updatedAt = now;
    return { changed: true, data: { document: clone(record), task: clone(task), action: clone(action) } };
  }
  if (request.op === 'routine.save') {
    const routine = normalizeRoutine(document, request, now);
    const index = document.routines.findIndex((entry) => entry.id === routine.id);
    if (index < 0) document.routines.push(routine); else document.routines[index] = routine;
    const nextRuns = routinePreview(routine, now, 3, document.settings);
    return { changed: true, data: { routine: { ...clone(routine), nextRuns }, nextRuns } };
  }
  if (request.op === 'routine.preview') {
    const routine = normalizeRoutine(document, request, now);
    return { changed: false, data: { nextRuns: routinePreview(routine, now, request.count || 3, document.settings), dstPolicy: 'skip-nonexistent-use-first-repeated' } };
  }
  if (request.op === 'routine.run' || request.op === 'routine.skip') return runRoutine(document, request, now, request.op === 'routine.skip');
  if (request.op === 'routine.snooze') {
    const routine = document.routines.find((entry) => entry.id === request.id);
    if (!routine) fail('Routine does not exist.', 'todo_not_found');
    routine.snoozedUntil = now + integer(request.minutes ?? 60, 'minutes', 1, 7 * 24 * 60) * 60_000;
    return { changed: true, data: { routine: clone(routine) } };
  }
  if (request.op === 'routine.generate') {
    const run = document.runs.find((entry) => entry.id === request.runId);
    if (!run) fail('Routine run does not exist.', 'todo_not_found');
    if (run.documentId) return { changed: false, data: { run: clone(run), document: clone(documentById(document, run.documentId)), duplicate: true } };
    if (run.status !== 'reminder') fail('Only a reminder can be converted to a draft.');
    const snapshot = run.routineSnapshot;
    const generated = generate(document, { kind: snapshot.reportKind, ...run.scope, startDate: run.startDate, endDate: run.endDate,
      timezone: run.timezone, template: snapshot.template, title: `${snapshot.name} · ${run.startDate}` }, now, snapshot.kind);
    run.documentId = generated.document.id;
    run.status = 'completed'; run.updatedAt = now; run.completedAt = now;
    return { changed: true, data: { ...generated, run: clone(run) } };
  }
  return null;
}
