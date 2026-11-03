/**
 * Agent-facing tool for the same todo list the left-sidebar panel shows.
 *
 * The tool and the panel route through `store.apply`, so an item the agent adds
 * appears in the panel and an item the user ticks off is visible to the agent.
 */
import { localDateKey, PRIORITIES, QUADRANTS } from './store.js';

/** Tool name as the model sees it. */
export const TOOL_NAME = 'todo_track';
/** Actions accepted by the tool. */
const ACTIONS = ['list', 'add', 'update', 'remove', 'clearDone'];

/**
 * Render one stored item as a checklist line.
 * @param item - normalized todo.
 * @param index - 1-based position.
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
 * Turn a store snapshot into the human-readable result text.
 * @param headline - short outcome sentence.
 * @param snapshot - current store snapshot.
 * @returns multi-line text listing the current items.
 */
function describe(headline, snapshot) {
  const today = localDateKey();
  const open = snapshot.items.filter((item) => !item.done).length;
  const focused = snapshot.items.filter((item) => item.todayDate === today && !item.done).length;
  const header = `${headline} — ${snapshot.items.length} todo(s), ${open} open, ${focused} in today's focus.`;
  if (snapshot.items.length === 0) return `${header}\nThe list is empty.`;
  return [header, ...snapshot.items.map((item, index) => renderItem(item, index, today))].join('\n');
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
      'Use action "list" to read the list, "add" to record a new item, "update" to change any field, "remove" to delete one, and "clearDone" to drop every completed item.',
      'Items carry planning detail: "tags" for module/category labels, "priority" P0–P3 for ranking, "quadrant" q1–q4 for the important/urgent matrix, and "today" to put the item into the user\'s today focus list.',
      'Link an item to the DSH session that owns the work (sessionId) so the user can jump back to that session from the panel.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
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
          items: {
            type: 'array',
            description: 'The complete list after the operation, newest first.',
            items: {
              type: 'object',
              additionalProperties: false,
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
        const text = typeof value?.message === 'string' && value.message !== ''
          ? value.message
          : describe('Todo list', store.snapshot());
        return [{ type: 'text', text }];
      },
    },
    isConcurrencySafe(args) {
      return args?.action === 'list';
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : '';
      if (!ACTIONS.includes(action)) {
        const message = `Unknown todo action "${action}". Expected one of: ${ACTIONS.join(', ')}.`;
        return { ok: false, code: 'todo_unknown_op', message, items: store.snapshot().items };
      }
      // "none" for priority/quadrant normalizes to null inside the store.
      const outcome = store.apply({ ...args, op: action });
      if (!outcome.ok) {
        return { ok: false, code: outcome.code, message: outcome.message, items: store.snapshot().items };
      }
      const headline = {
        list: 'Todo list',
        add: 'Added todo',
        update: 'Updated todo',
        remove: 'Removed todo',
        clearDone: 'Cleared completed todos',
      }[action];
      return {
        ok: true,
        message: describe(headline, outcome.snapshot),
        items: outcome.snapshot.items,
      };
    },
  });
}
