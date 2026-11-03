    /**
     * Restore a pomodoro left running in this browser, so closing the panel or
     * reloading the page does not silently drop a focus session.
     * @returns the stored session, or null when there is none worth resuming.
     */
    function loadPomodoro() {
      try {
        const raw = localStorage.getItem(POMODORO_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const phase = parsed.phase === 'break' ? 'break' : parsed.phase === 'focus' ? 'focus' : null;
        if (phase === null || typeof parsed.running !== 'boolean') return null;
        const total = phase === 'break' ? POMODORO_BREAK_MS : POMODORO_FOCUS_MS;
        const endsAt = typeof parsed.endsAt === 'number' && Number.isFinite(parsed.endsAt) ? parsed.endsAt : null;
        const pausedMs = typeof parsed.pausedMs === 'number' && Number.isFinite(parsed.pausedMs)
          ? Math.min(Math.max(parsed.pausedMs, 0), total)
          : total;
        // A session that finished long ago is stale, not worth resuming.
        if (parsed.running === true && (endsAt === null || endsAt < Date.now() - 5 * 60 * 1000)) return null;
        return {
          phase,
          running: parsed.running,
          endsAt: parsed.running ? endsAt : null,
          pausedMs,
          round: Number.isFinite(parsed.round) && parsed.round > 0 ? Math.floor(parsed.round) : 1,
          label: typeof parsed.label === 'string' && parsed.label.trim() !== '' ? parsed.label.slice(0, 120) : null,
        };
      } catch {
        return null;
      }
    }

    /** Full length of one phase. */
    function pomodoroTotal(pomodoro) {
      return pomodoro.phase === 'break' ? POMODORO_BREAK_MS : POMODORO_FOCUS_MS;
    }

    /** Milliseconds left in the current phase; a paused session keeps its remainder. */
    function pomodoroRemaining(pomodoro, now) {
      if (pomodoro === null) return 0;
      return pomodoro.running
        ? Math.max(0, (pomodoro.endsAt ?? now) - now)
        : Math.max(0, pomodoro.pausedMs);
    }

    /** Render a duration as mm:ss, rounding up so a fresh session starts at 25:00. */
    function formatClock(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }
