/**
 * `dsh-todos` — Host half.
 *
 * Owns the durable todo store, serves it to the Web Client over loopback routes,
 * and exposes the same operations to the agent as the `todo_track` tool. The
 * Client half (`client.js`) owns the left-sidebar entry and the panel.
 */
import { createTodoStore } from './lib/store.js';
import { registerTodoRoutes } from './lib/routes.js';
import { registerTodoTool } from './lib/tool.js';
import { registerWorkbenchTools } from './lib/workbench-tools.js';
import { createAutomation, projectWorkbench } from './lib/automation.js';

export const name = 'dsh-todos';

/**
 * @param ctx - Host plugin context.
 * @param config - this row's config from `cordis.patch.yml`.
 */
export function apply(ctx, config = {}) {
  const store = createTodoStore({
    file: typeof config.dataFile === 'string' && config.dataFile !== '' ? config.dataFile : undefined,
  });

  // A degradation in one half must stay visible instead of failing activation
  // silently: the panel API reports both states through GET .../state.
  const diagnostics = { api: 'pending', tool: 'pending' };
  let automation;
  ctx.effect(() => {
    const runner = createAutomation(store);
    automation = runner;
    return () => runner.dispose();
  }, 'dsh-todos: local draft automation');

  /**
   * Run one registration, recording its outcome instead of throwing.
   * @param key - diagnostics key to record.
   * @param register - owns the resource and returns its disposer.
   * @returns an effect body.
   */
  const effectBody = (key, register) => () => {
    try {
      const dispose = register();
      diagnostics[key] = 'registered';
      return () => {
        diagnostics[key] = 'removed';
        dispose();
      };
    } catch (error) {
      diagnostics[key] = `failed: ${error instanceof Error ? error.message : String(error)}`;
      return () => {};
    }
  };

  // The panel API needs the browser carrier; the agent tool needs the tool
  // registry. Each half activates only where its service exists, so a profile
  // without a Web server or without tools keeps the other half working.
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      effectBody('api', () => registerTodoRoutes(httpCtx.webServer, store, diagnostics,
        (snapshot) => projectWorkbench(store, snapshot, automation))),
      'dsh-todos: panel api',
    );
  });

  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(
      effectBody('tool', () => {
        const disposeTodo = registerTodoTool(toolCtx.tools, store);
        try {
          const disposeWorkbench = registerWorkbenchTools(toolCtx.tools, store);
          return () => { disposeWorkbench(); disposeTodo(); };
        } catch (error) { disposeTodo(); throw error; }
      }),
      'dsh-todos: agent tool',
    );
  });
}
