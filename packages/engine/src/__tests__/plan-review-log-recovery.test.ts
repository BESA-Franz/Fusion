import { describe, expect, it } from "vitest";
import type { TaskLogEntry } from "@fusion/core";
import { latestPlanReviewTerminalAfterReset } from "../plan-review-log-recovery.js";

function entry(action: string, timestamp: string, outcome?: string): TaskLogEntry {
  return { action, timestamp, ...(outcome ? { outcome } : {}) } as TaskLogEntry;
}

describe("latestPlanReviewTerminalAfterReset", () => {
  it("returns the latest terminal Plan Review when no reset occurred", () => {
    expect(latestPlanReviewTerminalAfterReset([
      entry("[pre-merge] Workflow step failed: Plan Review", "2026-08-01T01:00:00.000Z"),
      entry("[pre-merge] Workflow step completed: Plan Review", "2026-08-01T01:05:00.000Z", "approved"),
    ])).toEqual({
      status: "passed",
      timestamp: "2026-08-01T01:05:00.000Z",
      outcome: "approved",
    });
  });

  it("does not resurrect a Plan Review completed before a nuclear reset", () => {
    expect(latestPlanReviewTerminalAfterReset([
      entry("[pre-merge] Workflow step completed: Plan Review", "2026-08-01T01:00:00.000Z", "stale approval"),
      entry(
        "Task reset by user — all progress cleared, fresh worktree and branch will be allocated",
        "2026-08-01T02:00:00.000Z",
      ),
    ])).toBeUndefined();
  });

  it("accepts only a new terminal Plan Review recorded after the reset boundary", () => {
    expect(latestPlanReviewTerminalAfterReset([
      entry("[pre-merge] Workflow step completed: Plan Review", "2026-08-01T01:00:00.000Z", "stale approval"),
      entry(
        "Task reset by user — all progress cleared, fresh worktree and branch will be allocated",
        "2026-08-01T02:00:00.000Z",
      ),
      entry("[pre-merge] Workflow step failed: Plan Review", "2026-08-01T02:05:00.000Z", "revise"),
      entry("[pre-merge] Workflow step completed: Plan Review", "2026-08-01T02:10:00.000Z", "fresh approval"),
    ])).toEqual({
      status: "passed",
      timestamp: "2026-08-01T02:10:00.000Z",
      outcome: "fresh approval",
    });
  });
});
