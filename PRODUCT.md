# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the author, using DeepSeek Harness (DSH) for daily work. They juggle many tasks of uneven importance and urgency across several projects. They also owe daily, weekly and monthly reports, sometimes for a single project and sometimes for all of them, and want planning and retrospectives to change how the next cycle goes. Other DSH users may install the plugin from GitHub, but their needs do not drive design decisions.

## Product Purpose

个人工作台 (Personal Workbench) helps that person decide what matters today, record what actually happened, and turn those records into reports and retrospectives without retyping. Its loop runs: capture → judge importance and urgency → plan the day and week → execute and log progress → generate reports and reviews → adjust the next cycle.

Success means opening the panel each day and knowing what to push first. At the end of a period, a report or review should be mostly assembled from facts already recorded, needing editing rather than writing.

## Positioning

It lives inside DSH, beside the agent sessions where the work happens. Tasks link to DSH sessions, the agent edits the same store through `todo_track` and the `work_*` tools, and reports are built deterministically from the user's own events. Everything stays in a local file, with no model call, no external service, and nothing sent anywhere.

## Operating Context

- Opened from the DSH sidebar as a panel inside the DSH web UI (desktop app or browser build), next to agent conversations. It uses the host's React and the host's light/dark theme tokens, except Today, which keeps its own night palette.
- Views: task list, Eisenhower matrix (Q1–Q4 plus unsorted), Today with a 25/5 pomodoro and an animated focus orbit, projects, planning, and review (reports and retrospectives).
- The agent is a co-user: it reads and writes the same data the panel shows.
- Scheduled routines generate local report and review drafts on the Host; the user reviews, edits, finalizes, or exports them as Markdown.
- Used at desktop width most of the time; 375px narrow layouts must stay fully operable.

## Capabilities and Constraints

- Shipped as a DSH plugin (`dsh-todos` package name kept for install compatibility). The browser artifact is one prebuilt `client.js`; no CDN or runtime downloads.
- Data lives in a single Host JSON file (`todos.v3.json`) with locking, revisions and atomic writes. Deletes and "clear done" keep history; documents keep revisions.
- "Today" follows the workbench's configured time zone.
- Pomodoro state and the motion preference live in browser `localStorage`.
- Terminology: 四象限 / Q1–Q4 decide handling strategy; P0–P3 is execution order. Reports (日报 / 周报 / 月报) are separate from reviews (复盘). Private reflection never flows into reports.
- Reviews present facts and questions; they never assert causes or mark a review complete on the user's behalf.
- Out of scope for now: external sending, multi-user collaboration, project dependency graphs, two-way calendar sync.

## Brand Commitments

- Display name: 个人工作台 / Personal Workbench. `dsh-todos` stays only as the technical package name.
- Chinese is the primary copy language; English is a full translation of it.
- Existing icon: `icon.svg`.

## Evidence on Hand

- Real interface screenshots and motion captures in `docs/screenshots/`, all using demo data.
- Acceptance records: `docs/qa/2026-11-04-today-acceptance.md` and `docs/qa/2026-11-10-workbench-acceptance.md` (automated and browser checks, isolated preview only).
- No usage data, testimonials or metrics exist. The 2.0 workbench has not yet been verified in the author's real DSH profile. Default parameters (focus count, buffer ratio, routine timings) are untested guesses awaiting real use.

## Product Principles

1. Facts before narrative: reports and reviews come from recorded events, and unknown history is shown as unknown rather than guessed.
2. Never lose the user's work: history, revisions and the last committed state survive conflicts, failed writes and corrupt files.
3. Local and private by default: nothing leaves the machine; finalizing a document means local final, not sent.
4. The panel and the agent are equal clients of one store, so anything one can do the other can see.
5. Serve one person's daily loop: fast to capture, calm to plan, honest to review.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Keyboard and touch access to every action, visible focus, sufficient contrast in both host themes and Today's palette, screen-reader labels on controls, meaning that never relies on color alone (the matrix pairs color with text and Q1–Q4 labels), and full respect for reduced-motion, with animation never blocking input.
