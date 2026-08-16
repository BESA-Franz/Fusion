/**
 * Shared startup phase timing for CLI surfaces (dashboard, serve).
 *
 * FNXC:FasterStartup 2026-07-14-23:55:
 * Operators and developers need wall-clock labels for each boot phase so
 * time-to-listen regressions are attributable. Dashboard already had an
 * inline phaseTime helper; serve and factory/engine paths need the same
 * cheap pattern without inventing a separate metrics product.
 */

export type StartupPhaseLogger = (message: string, scope?: string) => void;

/**
 * Let a non-critical startup phase finish before the readiness budget when
 * possible, but do not let cache warming or an observer bootstrap prevent the
 * HTTP listener from becoming reachable.  The phase is deliberately kept
 * alive after deferral; its rejection is observed and logged instead of
 * becoming an unhandled promise.  This is used only for work that is safe to
 * complete after the listener is serving (for example task-cache warming).
 */
export async function completeStartupPhaseWithinBudget(
  label: string,
  fn: () => Promise<void> | void,
  budgetMs: number,
  log: StartupPhaseLogger,
  scope = "startup",
): Promise<boolean> {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new RangeError(`startup phase budget must be a positive finite number (received ${budgetMs})`);
  }

  const phase = phaseTime(label, fn, log, scope);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"deferred">((resolve) => {
    timer = setTimeout(() => resolve("deferred"), budgetMs);
  });

  try {
    const outcome = await Promise.race([
      phase.then(() => "completed" as const),
      timeout,
    ]);
    if (outcome === "completed") return true;

    log(`startup phase ${label}: deferred after ${budgetMs}ms; listener startup continues`, scope);
    // The phase is still authoritative for cache/observer readiness. Observe
    // late failures so a deferred startup never creates an unhandled rejection.
    void phase.catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log(`startup phase ${label}: deferred completion failed: ${message}`, scope);
    });
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Time an async or sync startup phase and log `startup phase <label>: Nms`.
 * Always logs in `finally` so failures still surface their duration.
 */
export async function phaseTime<T>(
  label: string,
  fn: () => Promise<T> | T,
  log: StartupPhaseLogger,
  scope = "startup",
): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    log(`startup phase ${label}: ${Date.now() - t0}ms`, scope);
  }
}
