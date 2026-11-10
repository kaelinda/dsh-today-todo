# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`dsh-todos` is a DeepSeek Harness (DSH) plugin: a personal workbench with tasks, projects, plans, reports, reviews and scheduled routines. It has two halves. The Host half (`index.js` + `lib/`) runs in Node 20+ and owns storage, a loopback HTTP API and agent tools. The Client half (`client.js`, built from `src/client/`) runs in the DSH web UI and registers a sidebar panel. User-facing docs and README are in Chinese; `docs/workbench.md` is the authoritative description of 2.0 behaviour (`docs/development.md` covers the older v1/v2 protocol).

## Commands

```bash
npm ci                     # install locked dev deps
npm run build              # regenerate client.js from src/client/
npm test                   # runs build first (pretest), then `node --test`
node --test test/store.test.mjs                      # single test file (build first if client sources changed)
node --test --test-name-pattern="revision" test/     # filter by test name
npm run preview            # real API + UI on http://127.0.0.1:4178 with temp demo data (?theme=dark, ?lang=en)
npm run test:browser       # Playwright flows; first run needs `npx playwright install chromium`
```

There is no linter or type checker configured.

## Generated artifact: never edit `client.js`

`client.js` is committed (so installs need no build or CDN) but generated. `scripts/build-client.mjs` takes `src/client/index.js` and recursively expands `// @include ./file.js` lines textually into one `window.__ModuleLoader__.load({ factory(require) { ... } })` closure, then replaces `// @bundle focus-scene` with an esbuild IIFE of `focus-scene.js` (which bundles Three.js).

Consequences:
- Most `src/client/*.js` files are not ES modules. They are fragments sharing one function scope (`React`, `h`, hooks, and every other fragment's top-level names are visible). Include order in `src/client/index.js` matters. Only `focus-scene.js` / `focus-motion.js` use `import`/`export`.
- The client gets React from the host via `require('react')`; React/ReactDOM in devDependencies exist only for the preview page.
- `test/build.test.mjs` fails if the committed `client.js` differs from `buildClient()` output, so always run `npm run build` after touching `src/client/` and commit both.

## Host architecture

- **Single mutation entry.** Every write (panel HTTP, `todo_track`, `work_*` agent tools, automation) goes through `store.apply({ op, ... })` in `lib/store.js`. It takes a sibling `.lock` file, reloads the document from disk, checks optional `baseRevision` (returning `todo_revision_conflict` with the current snapshot), applies the op to a clone, and persists by temp file + fsync + atomic rename. A failed write never publishes the in-memory draft. Errors come back as `{ ok: false, code: 'todo_*' }` rather than thrown.
- **Op dispatch.** `apply` tries `applyWorkOperation` (`lib/workbench-store.js`: tasks, projects, logs, plans, focus sessions, settings) then `applyInsightOperation` (`lib/insights.js`: reports, reviews, documents/revisions, routines, insights). Each returns `{ changed, data }` or nothing for unknown ops. New ops go in one of these two switch chains.
- **Data file / migration.** Default is `$DSH_HOME/dsh-todos/todos.v3.json` (override with `DSH_TODOS_FILE` or the `dataFile` config in `cordis.patch.yml`). A configured `todos.json` maps to sibling `todos.v3.json`. v1/v2 documents are read as a migration source and never overwritten; corrupt or unsupported-version files block writes instead of being replaced. v3 collections are listed in `COLLECTIONS` in `workbench-store.js`.
- **Routes** (`lib/routes.js`): `GET /plugins/dsh-todos/state` and `POST /plugins/dsh-todos/mutate`, restricted to loopback socket + loopback Host + matching Origin. The state response is enriched by `projectWorkbench()` (`lib/automation.js`) with insights and automation status.
- **Agent tools**: `lib/tool.js` (`todo_track`, paginated) and `lib/workbench-tools.js` (`work_project`, `work_log`, `work_plan`, `work_report`, `work_review`, `work_routine`, declared as a table mapping actions to store ops).
- **Automation** (`lib/automation.js` + `lib/calendar.js`): a Host interval (30s) finds due routine occurrences and generates local report/review drafts through the store. It needs no browser or model session; on restart only the latest missed occurrence is caught up.
- **`index.js`** wires these via cordis `ctx.inject(['webServer'])` and `ctx.inject(['tools'])` separately, so either half can fail or be absent without blocking the other; outcomes are recorded in a `diagnostics` object surfaced through the state route.

## Conventions worth knowing

- "Today" is computed in the workbench's configured time zone (`settings.timezone`), not the machine's.
- Deletes and "clear done" keep history (soft delete / archive); task changes record events.
- Pomodoro state and the motion preference live in browser `localStorage`, not the Host file. The timer uses absolute deadlines, so pausing animation never slows the clock.
- `scripts/preview.mjs` and the browser smoke test use a temp data dir and never touch real DSH data. Passing tests does not prove the installed DSH profile has the new version.
