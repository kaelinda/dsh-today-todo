/** Small domain tools sharing the exact transaction path used by the panel. */
const string = { type: 'string' };
const strings = { type: 'array', items: string };
const number = { type: 'number', minimum: 0 };
const common = {
  id: string, baseRevision: { type: 'integer', minimum: 0 },
  offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 },
};
const scope = { startDate: string, endDate: string, projectIds: strings, tags: strings, title: string, documentId: string };
const documentFields = { id: string, content: string, status: { type: 'string', enum: ['draft', 'final', 'pending'] }, revisionId: string, baseRevisionId: string };

const domains = [
  {
    name: 'work_project', collection: 'projects', actions: { save: 'project.save' },
    description: 'Create or edit stable projects and their goals. List projects to obtain IDs for task assignment and independently scoped reports.',
    fields: { name: string, goal: string, successCriteria: string, status: { type: 'string', enum: ['active', 'paused', 'archived', 'completed'] } },
  },
  {
    name: 'work_log', collection: 'logs', actions: { add: 'log.add' },
    description: 'Record factual progress, an outcome, blocker or decision. Do not infer accomplishments from task titles. time is the occurrence time; minutes is optional recorded effort.',
    fields: { taskId: string, projectId: string, kind: { type: 'string', enum: ['progress', 'outcome', 'blocker', 'decision'] }, text: string, time: string, minutes: number, url: string },
  },
  {
    name: 'work_plan', collection: 'plans', actions: { save: 'plan.save', settings: 'settings.update', focus: 'focus.record' },
    description: 'Commit a daily or weekly plan with task IDs and a time budget. Initial commitments remain immutable for later review. Record actual focus separately; do not invent time spent.',
    fields: { period: { type: 'string', enum: ['day', 'week'] }, date: string, title: string, taskIds: strings, capacityMinutes: number, bufferPercent: number, commit: { type: 'boolean' }, timezone: string, weekStartsOn: { type: 'integer', minimum: 0, maximum: 6 }, taskId: string, startedAt: number, endedAt: number, pauseMinutes: number, minutes: number, interrupted: { type: 'boolean' } },
  },
  {
    name: 'work_report', collection: 'documents', documentType: 'report', actions: { generate: 'report.generate', save: 'document.save', restore: 'document.restore' },
    description: 'Generate a factual daily, weekly or monthly report draft for one/many/all projects (empty projectIds means all). Dates use the configured timezone and [startDate,endDate). Saving and regenerating keep revisions. This tool never sends a report externally.',
    fields: { ...scope, ...documentFields, template: string, kind: { type: 'string', enum: ['daily', 'weekly', 'monthly'] } },
  },
  {
    name: 'work_review', collection: 'documents', documentType: 'review', actions: { generate: 'review.generate', save: 'document.save', restore: 'document.restore', action: 'review.action' },
    description: 'Prepare a private retrospective from recorded facts and unanswered reflection questions. A draft is not a completed review. Convert a user-chosen improvement into a real task with an optional follow-up date and success criteria. Private reflections are excluded from work reports.',
    fields: { ...scope, ...documentFields, template: string, kind: { type: 'string', enum: ['daily', 'weekly', 'monthly'] }, projectId: string, dueDate: string, successCriteria: string },
  },
  {
    name: 'work_routine', collection: 'routines', actions: { save: 'routine.save', preview: 'routine.preview', run: 'routine.run', skip: 'routine.skip', snooze: 'routine.snooze', generate: 'routine.generate' },
    description: 'Configure independent report/review routines, pause them with enabled=false, or generate a local draft now. The Host must be running; on restart only the latest missed occurrence is automatically caught up. Same rule/period is idempotent. No external sending.',
    fields: {
      name: string, kind: { type: 'string', enum: ['report', 'review'] }, reportKind: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
      projectIds: strings, tags: strings, template: string, frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'interval'] }, interval: { type: 'integer', minimum: 1 }, unit: { type: 'string', enum: ['day', 'week'] },
      weekdays: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } }, monthDay: { oneOf: [{ type: 'integer', minimum: 1, maximum: 31 }, { type: 'string', enum: ['last'] }] }, time: string, anchorDate: string, timezone: string,
      enabled: { type: 'boolean' }, mode: { type: 'string', enum: ['draft', 'remind'] }, coverage: { type: 'string', enum: ['previous', 'current', 'rolling'] },
      scheduledAt: number, periodStart: number, periodEnd: number,
      minutes: { type: 'integer', minimum: 1 }, runId: string, windowDays: { type: 'integer', minimum: 1, maximum: 1095 },
    },
  },
];

export function registerWorkbenchTools(registry, store) {
  const disposers = [];
  try {
    for (const domain of domains) {
      disposers.push(registry.register({
        name: domain.name,
        description: domain.description,
        parameters: { type: 'object', additionalProperties: false, required: ['action'], properties: {
          ...common, ...domain.fields, action: { type: 'string', enum: ['list', ...Object.keys(domain.actions)] },
        } },
        output: { schema: { type: 'object', additionalProperties: true, required: ['ok'], properties: { ok: { type: 'boolean' }, message: string } },
          render(_args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }]; } },
        isConcurrencySafe(args) { return args?.action === 'list'; },
        async execute(args = {}) {
          if (args.action === 'list') {
            const offset = args.offset ?? 0;
            const limit = args.limit ?? 50;
            if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
              return { ok: false, code: 'todo_bad_request', message: 'offset must be non-negative; limit must be 1–200.' };
            }
            const document = store.document();
            const all = (document[domain.collection] ?? []).filter((row) => !domain.documentType || (row.type ?? row.documentType) === domain.documentType);
            const items = all.slice(offset, offset + limit).map((row) => {
              const { facts: _facts, revisions: _revisions, ...summary } = row;
              return summary;
            });
            return { ok: true, items, total: all.length, offset, limit, hasMore: offset + items.length < all.length, revision: document.revision };
          }
          const op = domain.actions[args.action];
          if (!op) return { ok: false, code: 'todo_unknown_op', message: 'Unknown action.' };
          const { action: _action, ...request } = args;
          const result = store.apply({ ...request, op });
          if (!result.ok) return { ok: false, code: result.code, message: result.message };
          return { ok: true, message: args.action === 'preview' ? 'Preview ready.' : 'Saved locally.', revision: result.snapshot.revision, data: result.data ?? null };
        },
      }));
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
  return () => { for (const dispose of disposers.splice(0).reverse()) dispose(); };
}
