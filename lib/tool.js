/**
 * Agent-facing tool for the same todo list the left-sidebar panel shows.
 *
 * The tool and the panel route through `store.apply`, so an item the agent adds
 * appears in the panel and an item the user ticks off is visible to the agent.
 */
import {
  localDateKey,
  normalizePriority,
  normalizeQuadrant,
  PRIORITIES,
  QUADRANTS,
} from './store.js';

/** Tool name as the model sees it. */
export const TOOL_NAME = 'todo_track';
/** Mutating and reading actions accepted by the tool. */
const ACTIONS = ['list', 'add', 'update', 'remove', 'clearDone', 'restore'];
/** List scopes, mirroring the panel's scope tabs. */
const SCOPES = ['all', 'open', 'done', 'today'];
/** Default page size for list output. */
const DEFAULT_LIMIT = 50;
/** Largest page a caller may request. */
const MAX_LIMIT = 200;

/**
 * Render one stored item as a checklist line.
 * @param item - normalized todo.
 * @param index - 1-based position in the filtered list.
 * @param today - the Host's current local day key.
 * @returns one line of plain text.
 */
function renderItem(item, index, today) {
  const box = item.done ? '[x]' : '[ ]';
  const marks = [];
  if (item.priority !== null) marks.push(`[${item.priority}]`);
  if (item.quadrant !== null) marks.push(`(${item.quadrant.toUpperCase()})`);
  if (item.todayDate === today) marks.push('(today)');
  else if (item.todayDate !== null) marks.push(`(today=${item.todayDate})`);
  const prefix = marks.length === 0 ? '' : `${marks.join(' ')} `;
  const tags = item.tags.length === 0 ? '' : ` #${item.tags.join(' #')}`;
  const link = item.sessionId === null ? '' : ` · session ${item.sessionId}`;
  return `${index}. ${box} ${prefix}${item.title}${tags}${link}`;
}

/**
 * Read one bounded, non-negative integer argument.
 * @param value - raw argument.
 * @param fallback - value when the argument is absent.
 * @param min - smallest accepted value.
 * @param max - largest accepted value.
 * @param name - argument name for the error message.
 * @returns `{ value }` or `{ error }`.
 */
function readInteger(value, fallback, min, max, name) {
  if (value === undefined || value === null || value === '') return { value: fallback };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { error: `${name} must be an integer between ${min} and ${max}.` };
  }
  return { value: parsed };
}

/**
 * Apply the list filters and page window to a snapshot.
 * @param items - complete item list.
 * @param args - tool arguments.
 * @returns `{ page, total, matched, offset, limit, hasMore }` or `{ error }`.
 */
function selectPage(items, args) {
  const scope = args?.scope ?? 'all';
  if (!SCOPES.includes(scope)) {
    return { error: `scope must be one of: ${SCOPES.join(', ')}.` };
  }
  const offsetResult = readInteger(args?.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset');
  if (offsetResult.error) return { error: offsetResult.error };
  const limitResult = readInteger(args?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, 'limit');
  if (limitResult.error) return { error: limitResult.error };
  const offset = offsetResult.value;
  const limit = limitResult.value;

  let matched = items;
  if (scope === 'open') matched = matched.filter((item) => !item.done);
  else if (scope === 'done') matched = matched.filter((item) => item.done);
  else if (scope === 'today') matched = matched.filter((item) => item.todayDate === (args?.todayDate ?? localDateKey()));

  if (args?.filterPriority !== undefined && args.filterPriority !== null && args.filterPriority !== '') {
    const requested = String(args.filterPriority).trim().toLowerCase();
    if (requested === 'none') {
      matched = matched.filter((item) => item.priority === null);
    } else {
      const priority = normalizePriority(requested);
      if (priority === null) {
        return { error: 'filterPriority must be P0, P1, P2, P3, or none.' };
      }
      matched = matched.filter((item) => item.priority === priority);
    }
  }

  if (args?.filterQuadrant !== undefined && args.filterQuadrant !== null && args.filterQuadrant !== '') {
    const requested = String(args.filterQuadrant).trim().toLowerCase();
    if (requested === 'none') {
      matched = matched.filter((item) => item.quadrant === null);
    } else {
      const quadrant = normalizeQuadrant(requested);
      if (quadrant === null) {
        return { error: 'filterQuadrant must be q1, q2, q3, q4, or none.' };
      }
      matched = matched.filter((item) => item.quadrant === quadrant);
    }
  }

  if (typeof args?.filterTag === 'string') {
    const tag = args.filterTag.trim().replace(/^#+/, '').toLowerCase();
    if (tag !== '') matched = matched.filter((item) => item.tags.some((value) => value.toLowerCase() === tag));
  }

  if (typeof args?.filterQuery === 'string') {
    const query = args.filterQuery.trim().toLowerCase();
    if (query !== '') matched = matched.filter((item) => item.title.toLowerCase().includes(query));
  }
  if (args?.filterProjectId) matched = matched.filter((item) => item.projectId === args.filterProjectId);
  if (args?.filterStatus) matched = matched.filter((item) => item.status === args.filterStatus);

  const page = matched.slice(offset, offset + limit);
  return {
    page,
    total: items.length,
    matched: matched.length,
    offset,
    limit,
    hasMore: offset + page.length < matched.length,
  };
}

/**
 * Turn a store snapshot into the human-readable result text.
 * @param headline - short outcome sentence.
 * @param snapshot - current store snapshot.
 * @param view - page produced by {@link selectPage}.
 * @returns multi-line text listing the current page of items.
 */
function describe(headline, snapshot, view) {
  const today = snapshot.todayDate ?? localDateKey();
  const open = snapshot.items.filter((item) => !item.done).length;
  const focused = snapshot.items.filter((item) => item.todayDate === today && !item.done).length;
  const header = `${headline} — ${snapshot.items.length} todo(s), ${open} open, ${focused} in today's focus.`;
  const lines = [header];
  if (view.page.length === 0) {
    lines.push(view.matched === 0 ? 'No todos match this view.' : `No todos on this page; offset ${view.offset} is past the end.`);
    return lines.join('\n');
  }
  lines.push(...view.page.map((item, index) => renderItem(item, view.offset + index + 1, today)));
  const end = view.offset + view.page.length;
  if (view.hasMore || view.offset > 0 || view.matched !== view.total) {
    const filtered = view.matched === view.total ? '' : ` (filtered from ${view.total})`;
    lines.push(`Showing ${view.offset + 1}–${end} of ${view.matched}${filtered}.`);
  }
  if (view.hasMore) {
    lines.push(`More: call list with offset=${end}.`);
  }
  return lines.join('\n');
}

/**
 * Register the tool on a Host context that has `ctx.tools`.
 * @param tools - the `ctx.tools` service.
 * @param store - the todo store shared with the panel API.
 * @returns the disposer that unregisters the tool.
 */
export function registerTodoTool(tools, store) {
  return tools.register({
    name: TOOL_NAME,
    description: [
      'Track todo items in the Todo panel of the left sidebar, alongside the ones the user adds there.',
      'Use action "list" to read the list, "add" to record a new item, "update" to change any field, "remove" to move one to the recoverable archive, "clearDone" to archive completed items, and "restore" to recover an archived item. History is preserved.',
      'Items carry planning detail: "tags" for module/category labels, "priority" P0–P3 for ranking, "quadrant" q1–q4 for the important/urgent matrix, and "today" to put the item into the user\'s today focus list.',
      'Link an item to the DSH session that owns the work (sessionId) so the user can jump back to that session from the panel.',
      'For "list", the response is paged: use scope, filterPriority, filterQuadrant, filterTag, filterQuery, offset, and limit to narrow a long list.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        projectId: { type: 'string', description: 'Primary project ID; empty clears it.' },
        status: { type: 'string', enum: ['todo', 'doing', 'waiting', 'done', 'cancelled'] },
        dueDate: { type: 'string', description: 'Deadline YYYY-MM-DD; empty clears it.' },
        plannedDate: { type: 'string', description: 'Planned work day YYYY-MM-DD; empty clears it.' },
        estimateMinutes: { type: 'number', minimum: 0 },
        description: { type: 'string' },
        waitingFor: { type: 'string' },
        followUpDate: { type: 'string' },
        baseRevision: { type: 'integer', minimum: 0 },
        filterProjectId: { type: 'string' },
        filterStatus: { type: 'string', enum: ['todo', 'doing', 'waiting', 'done', 'cancelled'] },
        action: {
          type: 'string',
          enum: ACTIONS,
          description: 'Operation to perform on the todo list.',
        },
        id: {
          type: 'string',
          description: 'Todo id, required by "update" and "remove". Ids come from "list".',
        },
        title: {
          type: 'string',
          description: 'Todo title for "add", or the replacement title for "update".',
        },
        done: {
          type: 'boolean',
          description: 'Completion state to set on "update".',
        },
        sessionId: {
          type: 'string',
          description: 'DSH session id to link on "add"/"update"; an empty string clears the link.',
        },
        sessionTitle: {
          type: 'string',
          description: 'Cached session title shown in the panel while the session list is loading.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Complete tag list to set; each tag is a module/category label without "#".',
        },
        priority: {
          type: 'string',
          description: 'Priority level P0, P1, P2, P3, or "none" to clear it.',
        },
        quadrant: {
          type: 'string',
          description: 'Eisenhower quadrant q1 (important+urgent), q2 (important), q3 (urgent), q4 (neither), or "none" to clear it.',
        },
        today: {
          type: 'boolean',
          description: 'true puts the item into today\'s focus list, false removes it.',
        },
        scope: {
          type: 'string',
          enum: SCOPES,
          description: 'List scope: all, open, done, or today. Only used by "list"; defaults to all.',
        },
        filterPriority: {
          type: 'string',
          description: 'List filter: P0, P1, P2, P3, or "none" for unranked. Only used by "list".',
        },
        filterQuadrant: {
          type: 'string',
          description: 'List filter: q1, q2, q3, q4, or "none" for unclassified. Only used by "list".',
        },
        filterTag: {
          type: 'string',
          description: 'List filter: one tag, with or without a leading "#". Only used by "list".',
        },
        filterQuery: {
          type: 'string',
          description: 'List filter: case-insensitive text matched against the title. Only used by "list".',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'List page offset (default 0). Only used by "list".',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `List page size (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). Only used by "list".`,
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'items'],
        properties: {
          ok: { type: 'boolean', description: 'Whether the operation succeeded.' },
          code: { type: 'string', description: 'Failure code when ok is false.' },
          message: { type: 'string', description: 'Human-readable outcome.' },
          revision: { type: 'integer', description: 'Store revision after the operation.' },
          total: { type: 'integer', description: 'Total todos before filtering.' },
          matched: { type: 'integer', description: 'Todos matching the current view before paging.' },
          offset: { type: 'integer', description: 'Offset of the first returned item.' },
          limit: { type: 'integer', description: 'Maximum items the page could hold.' },
          hasMore: { type: 'boolean', description: 'Whether another page exists after this one.' },
          items: {
            type: 'array',
            description: 'The current page of todos after the operation, newest first.',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['id', 'title', 'done'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                done: { type: 'boolean' },
                sessionId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                sessionTitle: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                tags: { type: 'array', items: { type: 'string' } },
                priority: { oneOf: [{ type: 'string', enum: PRIORITIES }, { type: 'null' }] },
                quadrant: { oneOf: [{ type: 'string', enum: QUADRANTS }, { type: 'null' }] },
                todayDate: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                todayAt: { oneOf: [{ type: 'number' }, { type: 'null' }] },
                createdAt: { type: 'number' },
                updatedAt: { type: 'number' },
              },
            },
          },
        },
      },
      render(args, value) {
        if (typeof value?.message === 'string' && value.message !== '') {
          return [{ type: 'text', text: value.message }];
        }
        const snapshot = store.snapshot();
        return [{ type: 'text', text: describe('Todo list', snapshot, selectPage(snapshot.items, {})) }];
      },
    },
    isConcurrencySafe(args) {
      return args?.action === 'list';
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : '';
      if (!ACTIONS.includes(action)) {
        const message = `Unknown todo action "${action}". Expected one of: ${ACTIONS.join(', ')}.`;
        const snapshot = store.snapshot();
        return {
          ok: false,
          code: 'todo_unknown_op',
          message,
          items: selectPage(snapshot.items, {}).page,
          revision: snapshot.revision,
        };
      }

      if (action === 'list') {
        const snapshot = store.snapshot();
        const view = selectPage(snapshot.items, { ...args, todayDate: snapshot.todayDate });
        if (view.error) {
          return {
            ok: false,
            code: 'todo_bad_request',
            message: view.error,
            items: selectPage(snapshot.items, {}).page,
            revision: snapshot.revision,
          };
        }
        return {
          ok: true,
          message: describe('Todo list', snapshot, view),
          items: view.page,
          revision: snapshot.revision,
          total: view.total,
          matched: view.matched,
          offset: view.offset,
          limit: view.limit,
          hasMore: view.hasMore,
        };
      }

      // "none" for priority/quadrant normalizes to null inside the store.
      const outcome = store.apply({ ...args, op: action });
      if (!outcome.ok) {
        const current = store.snapshot();
        return {
          ok: false,
          code: outcome.code,
          message: outcome.message,
          items: selectPage(current.items, {}).page,
          revision: current.revision,
        };
      }
      const after = selectPage(outcome.snapshot.items, {});
      const headline = {
        list: 'Todo list',
        add: 'Added todo',
        update: 'Updated todo',
        remove: 'Removed todo (recoverable)',
        clearDone: 'Archived completed todos',
        restore: 'Restored todo',
      }[action];
      return {
        ok: true,
        message: describe(headline, outcome.snapshot, after),
        items: after.page,
        revision: outcome.snapshot.revision,
        total: after.total,
        matched: after.matched,
        offset: after.offset,
        limit: after.limit,
        hasMore: after.hasMore,
      };
    },
  });
}
