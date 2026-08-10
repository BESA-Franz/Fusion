import { evaluateSpecDrift, hasPriorLockDivergence, type CurrentPlanEvidence, type DriftReport, type SpecLock, type TaskStore } from "@fusion/core";

export interface SpecDriftSnapshot {
  latestLock?: SpecLock;
  currentPlan?: CurrentPlanEvidence;
  approvedPlanFingerprint?: string;
  modifiedFiles?: string[];
  priorDivergence?: boolean;
}
export interface SpecDriftRepository {
  snapshot(taskId: string): Promise<SpecDriftSnapshot>;
  persist(taskId: string, report: DriftReport): Promise<void>;
}

const RETRY_DELAY_MS = 1_000;

/**
 * FNXC:SpecDrift 2026-08-10-09:28:
 * Startup replay and live task mutations share this repository so both reconcile retained evidence
 * identically without treating drift as a lifecycle or quality verdict. A latest-report-only read
 * erases v1 divergence after a clean v2 re-lock; report identity fencing cannot prevent that
 * incorrect alignment because alignment is deliberately not part of the identity.
 */
export function createStoreSpecDriftRepository(
  store: Pick<TaskStore, "getTask" | "getLatestSpecLock" | "getLatestCurrentPlanEvidence" | "listSpecDriftReports" | "appendSpecDriftReport">,
): SpecDriftRepository {
  return {
    snapshot: async (taskId) => {
      const [task, latestLock, currentPlan, reports] = await Promise.all([
        store.getTask(taskId),
        store.getLatestSpecLock(taskId),
        store.getLatestCurrentPlanEvidence(taskId),
        store.listSpecDriftReports(taskId),
      ]);
      return {
        latestLock,
        currentPlan,
        approvedPlanFingerprint: task.approvedPlanFingerprint,
        modifiedFiles: task.modifiedFiles,
        priorDivergence: hasPriorLockDivergence(reports, latestLock?.version),
      };
    },
    persist: async (taskId, report) => { await store.appendSpecDriftReport(taskId, report); },
  };
}

/**
 * FNXC:SpecDrift 2026-08-09-18:17:
 * A report-write outage must retry from a fresh snapshot without waiting for process restart.
 * Timers coalesce per task and are cancelled on stop; retries never alter task lifecycle state.
 */
export class SpecDriftReconciler {
  private stopped = false;
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly queuedTaskIds = new Set<string>();
  public constructor(private readonly repository: SpecDriftRepository) {}

  /**
   * FNXC:SpecDrift 2026-08-09-18:32:
   * Live task events can arrive in one transaction-sized burst. Queue one fresh comparison per
   * task rather than making event delivery a polling loop; persistence still fences the snapshot.
   */
  enqueue(taskId: string): void {
    if (this.stopped || this.queuedTaskIds.has(taskId)) return;
    this.queuedTaskIds.add(taskId);
    queueMicrotask(() => {
      this.queuedTaskIds.delete(taskId);
      void this.reconcile(taskId).catch(() => undefined);
    });
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    this.queuedTaskIds.clear();
  }

  async reconcile(taskId: string): Promise<DriftReport | undefined> {
    if (this.stopped) return undefined;
    try {
      const snapshot = await this.repository.snapshot(taskId);
      if (this.stopped) return undefined;
      const report = evaluateSpecDrift(snapshot);
      if (this.stopped) return undefined;
      await this.repository.persist(taskId, report);
      const retry = this.retryTimers.get(taskId);
      if (retry) clearTimeout(retry);
      this.retryTimers.delete(taskId);
      return report;
    } catch (error) {
      this.scheduleRetry(taskId);
      throw error;
    }
  }

  private scheduleRetry(taskId: string): void {
    if (this.stopped || this.retryTimers.has(taskId)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(taskId);
      void this.reconcile(taskId).catch(() => undefined);
    }, RETRY_DELAY_MS);
    this.retryTimers.set(taskId, timer);
  }
}
