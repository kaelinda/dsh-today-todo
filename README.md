# dsh-todos

A DeepSeek Harness bundle that adds a **Todo** panel to the left sidebar, with a
zen "today" focus mode and a built-in pomodoro.

![license](https://img.shields.io/github/license/kaelinda/dsh-today-todo)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

- **Left sidebar entry** — a checklist icon in the sidebar panel list opens the
  todo panel in the main column.
- **Todo tracking** — add, rename, complete, delete, filter, and clear completed
  items. The list is stored by the Host in
  `$DSH_HOME/dsh-todos/todos.json`, so it survives Web reloads, app restarts,
  and browser data being cleared. Writes are fsynced and renamed into place, and
  a mutation re-reads the document under a lock so two DSH processes cannot
  overwrite each other.
- **Per-item details** (open with the chevron at the end of a row):
  - **Tags** — free-form module/category labels (`#panel`, `#docs`), editable as
    chips in the details drawer and filterable from the toolbar's filter popover.
  - **Priority** — `P0`–`P3` or unranked. A row shows the level as a 6 px colour
    dot; the labelled control and the per-level counts live in the details
    drawer and the filter popover. Priority drives row order (most urgent first).
  - **Four quadrants** — mark an item as Q1 important+urgent, Q2 important,
    Q3 urgent, or Q4 neither. The **四象限 / Matrix** view groups the list into
    those four boxes plus an "unclassified" bucket.
  - **Today** — put an item into the today focus list (sun button on the row, or
    the Today control in its details). The **今天 / Today** scope shows only
    those items, and anything added while that scope is active joins today
    automatically. The Host publishes the day key, so the panel uses one
    calendar even when the browser runs in another time zone. `todayDate` keeps
    the day key, so the focus list resets by itself each day while the record
    keeps the date it was planned for.
- **Zen mode for Today** — switching the scope to **今天 / Today** replaces the
  whole panel with a quiet, full-column focus view: one enso mark, the date,
  one centred add line, and only today's open items (priority reduced to a
  single dot). Statistics, filters, view switch, tag chips and the session chip
  row are all gone; a row's details stay one hover-click away. Completed items
  collapse behind "完成 N 项", finishing everything shows a closing line, and
  `← 退出` or `Esc` returns to the list. Adding while in zen joins today
  automatically. Motion respects `prefers-reduced-motion`.
- **Pomodoro inside zen** — the Today view carries a quiet `开始专注 · 25:00`
  control. Starting it swaps the enso for a 148 px progress ring: 25 minutes of
  focus (brand colour), then a 5 minute break (success colour), with mm:ss in the
  middle, a breathing animation on the ring, and a ping/flash animation when a
  phase completes (disabled under `prefers-reduced-motion`). Controls are just
  pause/resume and end; the session survives a panel remount or page reload via
  `localStorage`, and the first open today task is captured as the focus label.
- **Session linking and navigation** — link any todo to the DSH session that owns
  the work. The row shows that session's title; clicking it opens the session
  (`ctx.uiWorkspace.openSession`). Archived or deleted sessions are reported
  instead of navigating nowhere.
- **Agent parity** — the `todo_track` tool (`list` / `add` / `update` / `remove` /
  `clearDone`, with `tags`, `priority`, `quadrant`, `today`) calls the same Host
  store, so the agent and the panel share one list. `list` is paged and can be
  filtered by scope, priority, quadrant, tag, or title text, so a long list does
  not flood the model's context.

## Install

This bundle installs into one DeepSeek Harness **profile** — the desktop app uses
`desktop`, the browser build usually `web`. Installing changes that profile only;
afterwards every session in it sees the panel.

### From a checkout (verified)

```bash
git clone git@github.com:kaelinda/dsh-today-todo.git
```

Then install the checkout in one of three ways:

```bash
# 1. Desktop app: 插件 → 添加插件 → install from the local directory
# 2. CLI (restart the Host afterwards)
dsh plugin --profile desktop add /absolute/path/to/dsh-today-todo
# 3. In an agent session: plugin_manager → install_bundle, absolute directory path
```

The plugin is plain JavaScript with no runtime dependencies. The browser
`client.js` artifact is committed, so nothing is built or downloaded at install
time.

### From git

pnpm accepts git specs, so `dsh plugin --profile desktop add
git+ssh://git@github.com/kaelinda/dsh-today-todo.git` should work from the CLI.
If the desktop app refuses a git spec, clone the repository and install from the
local directory as above.

The package is **not published to npm** (`private: true`); this repository is the
distribution.

## Panel layout


The list view is deliberately sparse: one toolbar row, one-line rows, and the rest
behind the details chevron.

```
待办事项                                     [列表 | 四象限]
┌ 添加一条待办，按回车保存                                 ┐ ⊕
今天 3   全部 4   待办 3   已完成 1                    ⚲ 1
──────────────────────────────────────────────────────────
○  ●  点击会话标签，一键跳回本会话      ●                  ›
○  ●  点开左侧栏「待办」，试试详情                        ›
○     让智能体用 todo_track 帮你记待办                   ›
──────────────────────────────────────────────────────────
已完成 1
✓      todo_track 工具已通过端到端验证                   ›
                                         清除已完成
```

- **One toolbar**: scope tabs (今天 / 全部 / 待办 / 已完成) with counts, plus a
  single funnel button. Priority and tag filters live in that button's panel and
  show an active-filter badge when set — they are not permanently on screen.
- **One-line rows**: checkbox, a 6 px priority dot, the title, a 5 px amber dot
  for "in today", and a details chevron. Tags, quadrant, session link, today
  control and the progress fields are all inside the details drawer, opened by
  the chevron (double-click still renames).
- **Hover only**: today toggle, rename and delete appear on hover/focus; the
  details chevron stays visible.
- **Completed items** sit under a hairline "已完成 N" group instead of being
  interleaved with open work.
- **Adding** is one bordered field with a trailing ⊕ button; Enter submits.
- Clicking **今天** still switches to the zen focus view (see above).

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host half: mounts the store, the panel API, and the agent tool. |
| `lib/store.js` | Durable JSON store: normalization, revision guard, file lock, fsync, corrupt-file backup, and the single mutation path. |
| `lib/routes.js` | Loopback-only `GET /plugins/dsh-todos/state` and `POST /plugins/dsh-todos/mutate`. |
| `lib/tool.js` | The paged `todo_track` agent tool. |
| `src/client/` | Client source: entry, constants, locale, pomodoro helpers, shared helpers, icons, CSS, the panel page, and registration. |
| `scripts/build-client.mjs` | Deterministic include build that emits the shipped browser artifact. |
| `client.js` | Generated browser artifact: the `sidebar.panellist` entry, the list panel, and the zen Today view. Do not edit directly. |
| `locale/*.json` | Plugin Manager title/description. |
| `cordis.patch.yml` | Inserts the row that activates the bundle. |

## Development

No runtime dependencies. The shipped `client.js` is generated, so edit
`src/client/*.js` and run:

```bash
npm run build   # emit client.js from src/client
npm test        # build + node --test
```

`npm test` also checks that the committed `client.js` is exactly what the build
would produce, so the artifact cannot silently drift from its sources.

- **Host half** — `index.js` plus `lib/`; the Loader mounts the row declared in
  `cordis.patch.yml` and passes `config` to `apply(ctx, config)`.
- **Client half** — `src/client/index.js` is the factory entry; the build expands
  its `// @include` lines into the single `window.__ModuleLoader__` artifact.
  `client.js` is served to the page as that module, its `id` must equal the
  package name, and `dsh.client.immediately` makes the sidebar entry register at
  boot.
- **Styling** — theme tokens only (`--dsw-alias-*`), prefixed classes, no global
  selectors; motion is gated on `prefers-reduced-motion`.
- **Data during development** — `$DSH_HOME/dsh-todos/todos.json`; set
  `DSH_TODOS_FILE` or the row's `dataFile` to point elsewhere.
- **Tests** — `test/smoke.test.mjs` renders the client through a React stub;
  `test/store.test.mjs` covers fsync, corrupt-file recovery, revision conflicts,
  locks, and concurrent writers; `test/routes.test.mjs` pins the HTTP contract;
  `test/tool.test.mjs` covers paging and filters; `test/build.test.mjs` guards
  the generated artifact.
- **Reloading** — client changes hot-reload in the page; Host changes need the
  bundle row to reload (disable/enable the bundle, or restart the Host).

## Config


The bundle row accepts one optional field:

```yaml
- id: dsh-todos
  name: dsh-todos
  config:
    dataFile: /absolute/path/to/todos.json   # default: $DSH_HOME/dsh-todos/todos.json
```

The `DSH_TODOS_FILE` environment variable overrides the default path.

## Data

```json
{
  "version": 2,
  "revision": 3,
  "items": [
    {
      "id": "todo-…",
      "title": "Ship the todo panel",
      "done": false,
      "createdAt": 1730000000000,
      "updatedAt": 1730000000000,
      "sessionId": "session-…",
      "sessionTitle": "Panel work",
      "tags": ["panel", "docs"],
      "priority": "P0",
      "quadrant": "q1",
      "todayDate": "2026-11-03",
      "todayAt": 1730000000000
    }
  ]
}
```

Field contract:

| Field | Values |
| --- | --- |
| `revision` | monotonically increasing document revision used for optimistic locking |
| `tags` | up to 8 tags, each up to 24 characters, de-duplicated case-insensitively |
| `priority` | `P0` \| `P1` \| `P2` \| `P3` \| `null` |
| `quadrant` | `q1` \| `q2` \| `q3` \| `q4` \| `null` |
| `todayDate` | local day key `YYYY-MM-DD` or `null` |
| `todayAt` | when the item joined that day's focus list, for ordering |

A missing or malformed document degrades to an empty list; it never prevents the
plugin from activating. A corrupt document is first moved aside to
`todos.json.corrupt-<timestamp>` so it can be inspected or restored. Rows written
by version 1 are normalized to version 2.

### Concurrency and recovery

- The panel sends the `revision` it rendered with every mutation. If the agent or
  another tab wrote in the meantime, the Host returns `409` with
  `code: todo_revision_conflict` and its current snapshot; the panel applies that
  snapshot and retries once instead of overwriting the newer list.
- Each mutation takes a sibling `todos.json.lock`, re-reads the document under
  it, and only then applies the operation. A second process therefore merges its
  edit on top of the first rather than replacing the whole file from stale
  memory. A lock left by a crashed process is reclaimed after ten seconds.
- Persistence writes a temporary file, fsyncs it, renames it over the document,
  and fsyncs the directory best-effort. The temporary file has a process-unique
  name, so concurrent writers never share it.

## 中文速览

- 左侧栏「待办」入口：面板支持标签、P0–P3 优先级、四象限、今天、会话关联与一键跳转。
- 点「今天」进入沉浸式禅模式：圆相呼吸、日期、一行输入、只列今天未完成的事项，`Esc` 退出。
- 禅模式内置番茄钟：25 分钟专注 + 5 分钟休息，进度环呼吸与完成动画，可暂停/结束，刷新后自动恢复。
- 数据保存在 `~/.dsh/dsh-todos/todos.json`；写入使用 fsync + 原子替换，修改前加文件锁并重读，坏文件会备份为 `todos.json.corrupt-*`；面板用 revision 乐观锁避免覆盖智能体或其他标签页的新改动。
- 「今天」的日期由 Host 下发，浏览器时区不同也不会错位。
- 智能体通过 `todo_track` 工具读写同一份清单；`list` 支持分页与按范围、优先级、象限、标签、标题过滤。
- 安装：`dsh plugin --profile desktop add /绝对路径/dsh-today-todo`，重启 Host 后生效。

## License

MIT © 2026 kaelinda. See [LICENSE](LICENSE).
