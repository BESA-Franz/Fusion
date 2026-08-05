import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings, Task, TaskStore } from "@fusion/core";
import { TriageProcessor } from "../triage.js";

const settings = (defaultNodeId?: string): Settings => ({ defaultNodeId } as Settings);

const task = (nodeId?: string): Task => ({
  id: "BESA-164",
  lineageId: "lineage-besa-164",
  title: "Routing smoke",
  description: "Verify node-exclusive planning",
  column: "triage",
  status: null,
  nodeId,
  dependencies: [],
  steps: [],
  currentStep: 0,
  log: [],
  createdAt: "2026-08-03T10:00:00.000Z",
  updatedAt: "2026-08-03T10:00:00.000Z",
} as Task);

const processors: TriageProcessor[] = [];

function processorFor(
  processNodeId: string,
  registryLocalNodeId: string,
  storeOverrides: Partial<TaskStore> = {},
): TriageProcessor {
  const store = {
    on: vi.fn(),
    off: vi.fn(),
    ...storeOverrides,
  } as unknown as TaskStore;
  const processor = new TriageProcessor(store, "/tmp/fusion-triage-node-routing", {
    getLocalNodeId: () => processNodeId,
    getRegistryLocalNodeId: () => registryLocalNodeId,
  });
  processors.push(processor);
  return processor;
}

afterEach(() => {
  for (const processor of processors.splice(0)) processor.stop();
});

describe("node-exclusive triage planning", () => {
  it("does not discover a task explicitly routed to another process", async () => {
    const processor = processorFor("node-pc1", "node-vps");
    const discover = (processor as unknown as {
      discoverReadyPlanningTasks(tasks: Task[], now: number, settings: Settings): Promise<Task[]>;
    }).discoverReadyPlanningTasks.bind(processor);

    await expect(discover([task("node-pc2")], Date.now(), settings())).resolves.toEqual([]);
  });

  it("routes an unbound planning task only to the registry-local process", () => {
    const pc2 = processorFor("node-pc2", "node-vps") as unknown as {
      isTaskEligibleForThisProcess(task: Task, settings: Settings): boolean;
    };
    const vps = processorFor("node-vps", "node-vps") as unknown as {
      isTaskEligibleForThisProcess(task: Task, settings: Settings): boolean;
    };

    expect(pc2.isTaskEligibleForThisProcess(task(), settings())).toBe(false);
    expect(vps.isTaskEligibleForThisProcess(task(), settings())).toBe(true);
  });

  it("rechecks the authoritative node route inside the planning claim", async () => {
    const live = task("node-pc3");
    const updateTaskAtomic = vi.fn(async (
      _id: string,
      updater: (current: Task) => unknown,
    ) => {
      await updater(live);
      return live;
    });
    const processor = processorFor("node-pc2", "node-vps", { updateTaskAtomic } as Partial<TaskStore>);
    const harness = processor as unknown as {
      isTaskEligibleForThisProcess(task: Task, settings: Settings): boolean;
      updatePlanningStateIfStillCurrent(
        task: Task,
        patch: { status: string },
        guard: (live: Task) => boolean,
      ): Promise<boolean>;
    };

    const claimed = await harness.updatePlanningStateIfStillCurrent(
      task("node-pc2"),
      { status: "planning" },
      (current) => harness.isTaskEligibleForThisProcess(current, settings()),
    );

    expect(claimed).toBe(false);
    expect(updateTaskAtomic).toHaveBeenCalledOnce();
  });

  it("reads the current project default immediately before the planning claim", async () => {
    const live = task();
    const updateTaskAtomic = vi.fn(async (
      _id: string,
      updater: (current: Task) => unknown,
    ) => {
      await updater(live);
      return live;
    });
    const getSettings = vi.fn(async () => settings("node-pc3"));
    const processor = processorFor("node-pc2", "node-vps", {
      getSettings,
      updateTaskAtomic,
    } as Partial<TaskStore>);
    const claim = (processor as unknown as {
      claimPlanningIfOwned(task: Task): Promise<boolean>;
    }).claimPlanningIfOwned.bind(processor);

    await expect(claim(task())).resolves.toBe(false);
    expect(getSettings).toHaveBeenCalledOnce();
    expect(updateTaskAtomic).toHaveBeenCalledOnce();
  });

  it("does not clear another node's stale planning marker", async () => {
    const updateTask = vi.fn();
    const processor = processorFor("node-pc1", "node-vps", {
      getSettings: vi.fn(async () => settings()),
      updateTask,
    } as Partial<TaskStore>);
    const sweep = (processor as unknown as {
      sweepStalePlanningStatuses(tasks: Task[], now: number): Promise<void>;
    }).sweepStalePlanningStatuses.bind(processor);
    const foreignTask = {
      ...task("node-pc2"),
      status: "planning",
      updatedAt: "2026-08-03T00:00:00.000Z",
    } as Task;

    await sweep([foreignTask], Date.parse("2026-08-03T01:00:00.000Z"));

    expect(updateTask).not.toHaveBeenCalled();
  });
});
