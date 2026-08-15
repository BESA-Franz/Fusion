// @vitest-environment node
/*
FNXC:WorkflowLifecycleColumns 2026-07-31-10:40 (#2787 review — greptile P1, second round):

THE INVARIANT: the resolved load-lane set covers EVERY role the legacy literal covered.

The legacy set is `{todo, in-progress, in-review}`, and `todo` is the HOLD/INTAKE lane. My first
resolved union covered only wip and review — and because passing the argument OVERRIDES the
fallback rather than extending it, assigned backlog work stopped counting as load. A regression
against legacy behaviour, introduced by the argument meant to fix the renamed case.

That is the general trap with override-shaped options: the resolved answer must be a superset of what
the literal answered, or wiring the parameter is a downgrade for the roles it forgot. Cheap to get
wrong, invisible in a test that only checks the renamed lane.

This asserts the union the scheduler builds, driven by the real trait resolver, since the call site
sits inside a dispatch path a unit test has no business standing up.
*/
import { describe, expect, it } from "vitest";
import type { Task, WorkflowIr, WorkflowIrResolverStore } from "@fusion/core";
import { persistedTopLevelAgentTaskIdsFromStore } from "../concurrency/concurrency.js";

const RENAMED_IR = {
  version: "v2", id: "wf-renamed", name: "renamed", nodes: [], edges: [],
  columns: [
    { id: "inbox", name: "Inbox", traits: [{ trait: "intake" }] },
    { id: "backlog", name: "Backlog", traits: [{ trait: "hold" }] },
    { id: "building", name: "Building", traits: [{ trait: "wip", config: { limitSetting: "maxConcurrent" } }] },
    { id: "signoff", name: "Sign-off", traits: [{ trait: "merge" }] },
    { id: "qa", name: "QA", traits: [{ trait: "human-review" }] },
    { id: "shipped", name: "Shipped", traits: [{ trait: "complete" }] },
  ],
} as unknown as WorkflowIr;

function task(id: string, column: string, status: Task["status"]): Task {
  return {
    id,
    title: id,
    description: id,
    column,
    status,
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("the scheduler's store-backed load count covers every active workflow role", () => {
  it("counts active renamed lanes and excludes terminal work", async () => {
    const selection = { workflowId: RENAMED_IR.id, stepIds: [] };
    const store = {
      getTaskWorkflowSelection: () => selection,
      getTaskWorkflowSelectionAsync: async () => selection,
      getWorkflowDefinition: async () => ({ ir: RENAMED_IR }),
    } as WorkflowIrResolverStore;
    const tasks = [
      task("FN-1", "inbox", "planning"),
      task("FN-2", "backlog", "planning"),
      task("FN-3", "building", null),
      task("FN-4", "signoff", "merging"),
      task("FN-5", "qa", "reviewing"),
      task("FN-6", "shipped", "planning"),
    ];

    await expect(persistedTopLevelAgentTaskIdsFromStore(store, tasks)).resolves.toEqual([
      "FN-1",
      "FN-2",
      "FN-3",
      "FN-4",
      "FN-5",
    ]);
  });
});
