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
        // Expired sessions still need an explicit outcome, even after a long absence.
        if (parsed.running === true && endsAt === null) return null;
        return advancePomodoro({
          phase,
          running: parsed.running,
          endsAt: parsed.running ? endsAt : null,
          pausedMs,
          round: Number.isFinite(parsed.round) && parsed.round > 0 ? Math.floor(parsed.round) : 1,
          taskId: typeof parsed.taskId === 'string' && parsed.taskId ? parsed.taskId : null,
          review: ['elapsed', 'interrupted', 'blocked', 'breakDone', 'taskDone', 'missing'].includes(parsed.review) ? parsed.review : null,
          obstacle: typeof parsed.obstacle === 'string' ? parsed.obstacle.slice(0, 500) : '',
          label: typeof parsed.label === 'string' && parsed.label.trim() !== '' ? parsed.label.slice(0, 120) : null,
        }, Date.now());
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


    /** Pure transitions keep task identity and notes across pauses and reloads. */
    function reviewPomodoro(session, reason, now) {
      if (!session) return null;
      return { ...session, running: false, endsAt: null,
        pausedMs: pomodoroRemaining(session, now), review: reason };
    }

    function advancePomodoro(session, now) {
      if (!session?.running || now < session.endsAt) return session;
      return reviewPomodoro(session, session.phase === 'break' ? 'breakDone' : 'elapsed', now);
    }

    function focusPomodoro(item, now, previous = null) {
      if (!item || item.done) return null;
      const resume = previous?.phase === 'focus' && previous.taskId === item.id && previous.pausedMs > 0;
      const duration = resume ? previous.pausedMs : POMODORO_FOCUS_MS;
      return { phase: 'focus', taskId: item.id, label: item.title,
        running: true, endsAt: now + duration, pausedMs: duration,
        round: previous ? previous.round + (resume ? 0 : 1) : 1,
        review: null, obstacle: previous?.obstacle ?? '' };
    }

    function breakPomodoro(session, now) {
      return { ...session, phase: 'break', running: true,
        endsAt: now + POMODORO_BREAK_MS, pausedMs: POMODORO_BREAK_MS, review: null };
    }
