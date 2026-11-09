import { dueRoutineOccurrences, routinePreview } from './calendar.js';
import { planningInsights } from './insights.js';

/**
 * Host-owned wake-ups; durable rules and idempotent runs live in the store.
 * Draft generation is deterministic and atomic, so it needs neither a browser
 * tab nor a model/agent session. Restart catches up only the latest occurrence.
 */
export function createAutomation(store, options = {}) {
  const now = options.now ?? Date.now;
  const every = options.setInterval ?? globalThis.setInterval;
  const stop = options.clearInterval ?? globalThis.clearInterval;
  const intervalMs = options.intervalMs ?? 30_000;
  const failures = new Map();
  const status = { state: 'starting', intervalMs, lastCheckedAt: null, lastSavedAt: null, errors: [], olderMissed: [] };
  let disposed = false;
  let running = false;

  function tick() {
    if (disposed || running) return;
    running = true;
    const at = now();
    status.lastCheckedAt = at;
    try {
      const doc = store.document();
      const due = dueRoutineOccurrences(doc, at);
      status.olderMissed = due.filter((item) => item.olderMissed > 0).map(({ routineId, olderMissed }) => ({ routineId, count: olderMissed }));
      const dueIds = new Set(due.map((item) => item.routineId));
      for (const id of failures.keys()) if (!dueIds.has(id)) failures.delete(id);
      for (const occurrence of due) {
        const routine = doc.routines.find((item) => item.id === occurrence.routineId);
        const periodKey = `${occurrence.periodStart}/${occurrence.periodEnd}`;
        let failure = failures.get(routine.id);
        if (failure?.ruleUpdatedAt !== routine.updatedAt || failure?.periodKey !== periodKey) { failures.delete(routine.id); failure = null; }
        if (failure && (failure.attempts >= 5 || failure.nextRetryAt > at)) continue;
        const result = store.apply({ op: 'routine.run', id: routine.id, scheduledAt: occurrence.scheduledAt });
        if (result.ok) {
          failures.delete(routine.id);
          status.lastSavedAt = at;
        } else {
          const attempts = (failure?.attempts ?? 0) + 1;
          failures.set(routine.id, { routineId: routine.id, periodKey, message: result.message, code: result.code, attempts,
            ruleUpdatedAt: routine.updatedAt, nextRetryAt: attempts >= 5 ? null : at + Math.min(30_000 * 2 ** (attempts - 1), 300_000) });
        }
      }
      status.errors = [...failures.values()];
      status.state = failures.size ? 'degraded' : 'running';
    } catch (error) {
      status.state = 'degraded';
      status.errors = [{ message: error instanceof Error ? error.message : String(error) }];
    } finally {
      running = false;
    }
  }

  const timer = every(tick, intervalMs);
  timer?.unref?.();
  tick();
  return {
    tick,
    status: () => structuredClone(status),
    dispose() { disposed = true; stop(timer); status.state = 'stopped'; },
  };
}

export function projectWorkbench(store, snapshot, automation, at = Date.now()) {
  const document = store.document();
  let insights = null;
  let analysisError = null;
  try { insights = planningInsights(document, { now: at }); }
  catch (error) { analysisError = error instanceof Error ? error.message : String(error); }
  return {
    ...snapshot,
    routines: (snapshot.routines ?? []).map((routine) => {
      try { return { ...routine, nextRuns: routinePreview(routine, at, 3, document.settings) }; }
      catch (error) { return { ...routine, nextRuns: [], previewError: error instanceof Error ? error.message : String(error) }; }
    }),
    insights, analysisError,
    automation: automation?.status() ?? { state: 'unavailable' },
  };
}
