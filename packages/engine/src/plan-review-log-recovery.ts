import type { TaskLogEntry } from "@fusion/core";

export interface PlanReviewTerminalLog {
  status: "passed" | "failed";
  timestamp?: string;
  outcome?: string;
}

const PLAN_REVIEW_COMPLETED_ACTION = "[pre-merge] Workflow step completed: Plan Review";
const PLAN_REVIEW_FAILED_ACTION = "[pre-merge] Workflow step failed: Plan Review";
const NUCLEAR_RESET_ACTION_PREFIX = "Task reset by user — all progress cleared";

/**
 * FNXC:PlanReviewResetBoundary 2026-08-04-04:25:
 * Return only the latest terminal Plan Review from the current task generation.
 * A nuclear reset keeps the audit log, but entries before its most recent reset
 * boundary must never be reconstructed into live workflow state.
 */
export function latestPlanReviewTerminalAfterReset(
  log: readonly TaskLogEntry[] | undefined,
): PlanReviewTerminalLog | undefined {
  let latest: PlanReviewTerminalLog | undefined;

  for (const entry of log ?? []) {
    if (entry.action.startsWith(NUCLEAR_RESET_ACTION_PREFIX)) {
      latest = undefined;
    } else if (entry.action === PLAN_REVIEW_COMPLETED_ACTION) {
      latest = { status: "passed", timestamp: entry.timestamp, outcome: entry.outcome };
    } else if (entry.action === PLAN_REVIEW_FAILED_ACTION) {
      latest = { status: "failed", timestamp: entry.timestamp, outcome: entry.outcome };
    }
  }

  return latest;
}
