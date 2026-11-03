# Changelog

## 1.0.0 — 2026-11-03

First release.

- **Left sidebar entry** — a checklist icon in the sidebar panel list opens the
  todo panel in the main column.
- **Todo tracking** — add, rename, complete, delete, filter, clear completed; the
  list is stored by the Host in `$DSH_HOME/dsh-todos/todos.json`.
- **Per-item details** — tags (module/category), priority `P0`–`P3`, Eisenhower
  quadrant `Q1`–`Q4`, and a per-day "today" focus date.
- **Zen today mode** — switching the scope to 今天 turns the panel into a quiet
  focus view: enso mark, one add line, today's open items only, collapsed
  completed items, exit with `Esc`.
- **Pomodoro inside zen** — 25 minute focus / 5 minute break with a progress
  ring, breathing and completion animations, pause/resume/end, and `localStorage`
  recovery.
- **Session linking** — link an item to the DSH session that owns the work and
  jump to it in one click, with archived/deleted sessions reported instead of a
  dead navigation.
- **Agent parity** — the `todo_track` tool (list / add / update / remove /
  clearDone, with tags, priority, quadrant and today) calls the same Host store.
- **Compact list redesign** — one toolbar row with scope tabs plus a filter
  popover, one-line rows, details behind a chevron, completed items grouped.
