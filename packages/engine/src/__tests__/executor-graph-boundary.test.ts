/*
FNXC:WorkflowMerge 2026-07-19-05:20:
U5a scenario 1 — the workflow merge boundary lands the card in the merge NODE's
OWN IR column, not a hardcoded "in-review":
  - builtin:coding places its merge-class nodes in `in-review` → the default
    pipeline lands in `in-review` (KTD-7 parity), byte-identical to before.
  - a user-authored workflow (the benchmark) places the merge node in `Merging`
    → the card lands in `Merging` because the IR says so.
These call the executor's merge-boundary resolution directly (via `as any`) so the
assertion does not depend on the full agent-session execute() path.
*/
import { describe, expect, it, vi } from "vitest";
import "./executor-test-helpers.js";
import { TaskExecutor } from "../executor.js";
import { createMockStore } from "./executor-test-helpers.js";
import type { WorkflowIr } from "@fusion/core";

function benchmarkIr(): WorkflowIr {
  return {
    version: "v2",
    name: "benchmark",
    columns: [
      { id: "in-review", name: "In review", traits: [{ trait: "human-review" }] },
      { id: "merging", name: "Merging", traits: [{ trait: "merge" }, { trait: "merge-blocker" }] },
      { id: "done", name: "Done", traits: [{ trait: "complete" }] },
    ],
    nodes: [
      { id: "start", kind: "start", column: "in-review" },
      { id: "merge-gate", kind: "merge-gate", column: "merging", config: { gate: "auto-merge" } },
      { id: "end", kind: "end", column: "done" },
    ],
    edges: [
      { from: "start", to: "merge-gate" },
      { from: "merge-gate", to: "end", condition: "success" },
    ],
  } as WorkflowIr;
}

function executeIr(): WorkflowIr {
  return {
    version: "v2",
    name: "execute then merge",
    columns: [
      { id: "in-progress", name: "In progress", traits: [] },
      { id: "in-review", name: "In review", traits: [{ trait: "merge" }, { trait: "merge-blocker" }] },
    ],
    nodes: [
      { id: "execute", kind: "prompt", column: "in-progress", config: { seam: "execute" } },
      { id: "merge", kind: "merge-gate", column: "in-review" },
    ],
    edges: [{ from: "execute", to: "merge", condition: "success" }],
  } as WorkflowIr;
}

function foreachIr(): WorkflowIr {
  return {
    version: "v2",
    name: "foreach then merge",
    columns: [
      { id: "in-progress", name: "In progress", traits: [] },
      { id: "in-review", name: "In review", traits: [{ trait: "merge" }, { trait: "merge-blocker" }] },
    ],
    nodes: [
      {
        id: "steps",
        kind: "foreach",
        column: "in-progress",
        config: {
          source: "task-steps",
          template: {
            nodes: [{ id: "step-execute", kind: "prompt", config: { seam: "step-execute" } }],
            edges: [],
          },
        },
      },
      { id: "merge", kind: "merge-gate", column: "in-review" },
    ],
    edges: [{ from: "steps", to: "merge", condition: "success" }],
  } as WorkflowIr;
}

function makeExecutor(opts: {
  selection?: { workflowId: string; stepIds: string[] };
  ir?: WorkflowIr;
  taskColumn?: string;
  steps?: Array<{ id: string; title: string; status: "pending" | "done" }>;
  workflowStepResults?: Array<{
    workflowStepId: string;
    workflowStepName: string;
    source: "node";
    phase: "pre-merge";
    status: "passed";
    completedAt: string;
  }>;
  noCommitsExpected?: boolean;
}) {
  const store = createMockStore() as unknown as Record<string, unknown>;
  const liveTask = {
    id: "FN-B1",
    title: "t",
    description: "",
    column: opts.taskColumn ?? "in-review",
    dependencies: [],
    steps: opts.steps ?? [],
    workflowStepResults: opts.workflowStepResults ?? [],
    currentStep: 0,
    noCommitsExpected: opts.noCommitsExpected,
    log: [],
    prompt: "# t",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.getTask = vi.fn().mockResolvedValue(liveTask);
  store.getTaskWorkflowSelection = vi.fn(() => opts.selection);
  store.getTaskWorkflowSelectionAsync = vi.fn(async () => opts.selection);
  store.getWorkflowDefinition = vi.fn(async () => (opts.ir ? { ir: opts.ir } : undefined));
  const executor = new TaskExecutor(store as never, "/tmp/exec-boundary");
  return { executor: executor as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>, store, liveTask };
}

describe("U5a — IR-driven merge boundary (scenario 1)", () => {
  it("resolves the merge column to the benchmark merge node's own column (Merging)", async () => {
    const { executor } = makeExecutor({ selection: { workflowId: "custom:benchmark", stepIds: [] }, ir: benchmarkIr() });
    const column = await executor.resolveMergeBoundaryColumn("FN-B1", "merge-gate");
    expect(column).toBe("merging");
  });

  it("resolves the merge column to `in-review` for builtin:coding (KTD-7 parity)", async () => {
    // No selection → resolveWorkflowIrForTask falls back to builtin:coding, whose
    // merge-class nodes live in `in-review`.
    const { executor } = makeExecutor({ selection: undefined });
    const column = await executor.resolveMergeBoundaryColumn("FN-B1", "merge-gate");
    expect(column).toBe("in-review");
  });

  it("falls back to the first merge-class node's column when the named node id is synthetic/unknown", async () => {
    const { executor } = makeExecutor({ selection: { workflowId: "custom:benchmark", stepIds: [] }, ir: benchmarkIr() });
    // The legacy merge seam passes a synthetic id ("legacy-merge-seam") that is not
    // in the IR — resolution keys on merge-class kinds, landing in `merging`.
    const column = await executor.resolveMergeBoundaryColumn("FN-B1", "legacy-merge-seam");
    expect(column).toBe("merging");
  });

  it("moves the card to the benchmark merge column (Merging), not in-review", async () => {
    const { executor, store } = makeExecutor({
      selection: { workflowId: "custom:benchmark", stepIds: [] },
      ir: benchmarkIr(),
      taskColumn: "in-review", // arrived from review; must advance to Merging
    });
    await executor.ensureWorkflowMergeBoundaryTask(
      { id: "FN-B1", column: "in-review", steps: [] },
      { reason: "workflow-merge-boundary", nodeId: "merge-gate", workflowId: "custom:benchmark", runId: "r1" },
    );
    const moveTask = store.moveTask as ReturnType<typeof vi.fn>;
    expect(moveTask).toHaveBeenCalledWith("FN-B1", "merging", expect.anything());
  });

  it("is a no-op when the card is already in the resolved merge column", async () => {
    const { executor, store } = makeExecutor({
      selection: { workflowId: "custom:benchmark", stepIds: [] },
      ir: benchmarkIr(),
      taskColumn: "merging",
    });
    await executor.ensureWorkflowMergeBoundaryTask(
      { id: "FN-B1", column: "merging", steps: [] },
      { reason: "workflow-merge-boundary", nodeId: "merge-gate", workflowId: "custom:benchmark", runId: "r1" },
    );
    const moveTask = store.moveTask as ReturnType<typeof vi.fn>;
    expect(moveTask).not.toHaveBeenCalled();
  });

  /*
  FNXC:WorkflowLifecycle 2026-07-26-22:59:
  Successful pre-merge proof must still project graph-native results onto legacy steps after review handoff has already moved the card into the merge column; the projection must not trigger a redundant move.
  */
  it("projects graph-native completion after review handoff already moved the card to the merge column", async () => {
    const pendingSteps = [
      { id: "0", title: "Preflight", status: "pending" as const },
      { id: "1", title: "Implement", status: "pending" as const },
    ];
    const { executor, store, liveTask } = makeExecutor({
      selection: { workflowId: "custom:execute", stepIds: [] },
      ir: executeIr(),
      taskColumn: "in-review",
      steps: pendingSteps,
      workflowStepResults: [{
        workflowStepId: "execute",
        workflowStepName: "Execute",
        source: "node",
        phase: "pre-merge",
        status: "passed",
        completedAt: new Date().toISOString(),
      }],
    });

    await executor.ensureWorkflowMergeBoundaryTask(
      liveTask,
      { reason: "workflow-merge-boundary", nodeId: "merge", workflowId: "custom:execute", runId: "r1" },
    );

    expect(store.updateTask).toHaveBeenCalledWith(
      "FN-B1",
      {
        steps: pendingSteps.map((step) => ({ ...step, status: "done" })),
        currentStep: 1,
      },
      undefined,
    );
    expect(store.moveTask).not.toHaveBeenCalled();
  });

  /*
  FNXC:BesaNoCommitMergeBoundary 2026-08-04-23:48:
  Explicit no-commit tasks may cross a foreach merge boundary without optional node results only when the existing checklist is fully terminal and foreach coverage is complete. Incomplete checklist evidence remains fail-closed.
  */
  it("allows an explicit no-commit task with terminal foreach coverage and no optional node results to reach merge", async () => {
    const terminalSteps = [
      { id: "0", title: "Inspect", status: "done" as const },
      { id: "1", title: "Report", status: "done" as const },
    ];
    const { executor, store, liveTask } = makeExecutor({
      selection: { workflowId: "custom:foreach", stepIds: [] },
      ir: foreachIr(),
      taskColumn: "in-progress",
      steps: terminalSteps,
      workflowStepResults: [],
      noCommitsExpected: true,
    });

    await executor.ensureWorkflowMergeBoundaryTask(
      liveTask,
      { reason: "workflow-merge-boundary", nodeId: "merge", workflowId: "custom:foreach", runId: "r-no-commit" },
    );

    expect(store.moveTask).toHaveBeenCalledWith("FN-B1", "in-review", expect.anything());
    expect(store.logEntry).toHaveBeenCalledWith(
      "FN-B1",
      "Workflow merge boundary accepted explicit no-commit completion with terminal foreach coverage",
      undefined,
      undefined,
    );
  });

  it("does not let the no-commit exemption bypass incomplete foreach work", async () => {
    const incompleteSteps = [
      { id: "0", title: "Inspect", status: "done" as const },
      { id: "1", title: "Report", status: "pending" as const },
    ];
    const { executor, store, liveTask } = makeExecutor({
      selection: { workflowId: "custom:foreach", stepIds: [] },
      ir: foreachIr(),
      taskColumn: "in-progress",
      steps: incompleteSteps,
      workflowStepResults: [],
      noCommitsExpected: true,
    });

    await executor.ensureWorkflowMergeBoundaryTask(
      liveTask,
      { reason: "workflow-merge-boundary", nodeId: "merge", workflowId: "custom:foreach", runId: "r-incomplete" },
    );

    expect(store.moveTask).not.toHaveBeenCalled();
    expect(store.logEntry).toHaveBeenCalledWith(
      "FN-B1",
      expect.stringContaining("Workflow merge boundary blocked:"),
      undefined,
      undefined,
    );
  });
});
