    /** Locale namespace shared by the sidebar label and the panel. */
    const NS = 'dsh-todos';
    /** Panel id: the sidebar list id and the `main` slot key are the same value. */
    const PANEL_ID = 'dsh-todos';
    /** Host routes served by the bundle's Host half. */
    const STATE_ENDPOINT = '/plugins/dsh-todos/state';
    const MUTATE_ENDPOINT = '/plugins/dsh-todos/mutate';
    /** Background refresh, so an item the agent adds shows up without a reload. */
    const REFRESH_MS = 8000;
    /** How many sessions the picker lists at once. */
    const PICKER_LIMIT = 60;
    /** Fallbacks when the slot hands over no session/workspace projection. */
    const EMPTY_SESSIONS = { ids: [], byId: {}, phase: 'ready' };
    const EMPTY_WORKSPACES = { phase: 'ready', state: 'ready', archivedSessionIds: [] };
    /** Untranslated fallback: a missing dictionary must not blank the panel. */
    const identity = (key) => key;
    /** Priority levels, most urgent first, mirroring the Host store. */
    const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
    /** Pomodoro: 25 minute focus, 5 minute break, remembered across remounts. */
    const POMODORO_KEY = 'dsh-todos.pomodoro.v1';
    const POMODORO_FOCUS_MS = 25 * 60 * 1000;
    const POMODORO_BREAK_MS = 5 * 60 * 1000;

    /** Sort rank for one priority level; unranked sorts last. */
    const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
    /** Zen mode shows priority as one quiet dot instead of a labelled pill. */
    const PRIORITY_COLOR = {
      P0: 'var(--dsw-alias-state-error-primary)',
      P1: 'var(--dsw-alias-state-warn-primary)',
      P2: 'var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))',
      P3: 'var(--dsw-alias-state-success-primary)',
    };
    /** Eisenhower quadrants; `q1` is important+urgent. */
    const QUADRANTS = ['q1', 'q2', 'q3', 'q4'];

    /** Join truthy class-name parts. */
    const cx = (...parts) => parts.filter(Boolean).join(' ');
