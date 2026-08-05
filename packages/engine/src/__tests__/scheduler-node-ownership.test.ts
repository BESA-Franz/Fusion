import { describe, expect, it, vi } from "vitest";
import type { Task, TaskStore } from "@fusion/core";
import { Scheduler } from "../scheduler.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-SCHED-NODE",
    title: "Scheduler ownership",
    column: "in-progress",
    nodeId: "node-vps",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  } as Task;
}

describe("Scheduler post-release node ownership", () => {
  it.each([
    ["another node", { nodeId: "node-pc2" }],
    ["a non-WIP lane", { column: "in-review" }],
  ])("does not commit a released dispatch after the task moves to %s", async (_label, override) => {
    const live = task(override as Partial<Task>);
    const updateTaskAtomic = vi.fn(async (_id: string, updater: (current: Task) => unknown) => {
      await updater(live);
      return live;
    });
    const withPlanningLifecycleLock = vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback());
    const withTaskMutationLock = vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback());
    const store = {
      getSettings: vi.fn(async () => ({})),
      getTask: vi.fn(async () => live),
      updateTaskAtomic,
      withPlanningLifecycleLock,
      withTaskMutationLock,
      getTaskWorkflowSelectionAsync: vi.fn(async () => undefined),
      getWorkflowDefinition: vi.fn(async () => undefined),
      getRootDir: vi.fn(() => "/tmp/project"),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as TaskStore;
    const scheduler = new Scheduler(store, {
      localNodeId: "node-vps",
      registryLocalNodeId: "node-vps",
    });
    const persist = (scheduler as unknown as {
      persistReleasedDispatchIfStillOwned(id: string, patch: { status: null }): Promise<Task | null>;
    }).persistReleasedDispatchIfStillOwned.bind(scheduler);

    await expect(persist(live.id, { status: null })).resolves.toBeNull();
    expect(withPlanningLifecycleLock).toHaveBeenCalledWith(live.id, expect.any(Function));
    expect(withTaskMutationLock).toHaveBeenCalledWith(live.id, expect.any(Function));
  });

  it("keeps the persisted locked-move route when project settings change before handoff", async () => {
    const live = task({
      nodeId: undefined,
      effectiveNodeId: "node-vps",
    });
    const updateTaskAtomic = vi.fn(async (_id: string, updater: (current: Task) => Promise<unknown>) => {
      const patch = await updater(live);
      return patch ? { ...live, ...(patch as object) } : live;
    });
    const store = {
      // This changed after the locked move persisted effectiveNodeId=node-vps.
      getSettings: vi.fn(async () => ({ defaultNodeId: "node-pc2" })),
      getTask: vi.fn(async () => live),
      updateTaskAtomic,
      withPlanningLifecycleLock: vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback()),
      withTaskMutationLock: vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback()),
      getTaskWorkflowSelectionAsync: vi.fn(async () => undefined),
      getWorkflowDefinition: vi.fn(async () => undefined),
      getRootDir: vi.fn(() => "/tmp/project"),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as TaskStore;
    const scheduler = new Scheduler(store, {
      localNodeId: "node-vps",
      registryLocalNodeId: "node-vps",
    });
    const persist = (scheduler as unknown as {
      persistReleasedDispatchIfStillOwned(id: string, patch: { status: null }): Promise<Task | null>;
    }).persistReleasedDispatchIfStillOwned.bind(scheduler);

    await expect(persist(live.id, { status: null })).resolves.toMatchObject({
      effectiveNodeId: "node-vps",
      status: null,
    });
    expect(updateTaskAtomic).toHaveBeenCalledOnce();
  });

  it("keeps a persisted local route despite stale task routing and changed settings", async () => {
    const live = task({
      nodeId: "node-remote-override",
      effectiveNodeId: undefined,
      effectiveNodeSource: "local",
    });
    const updateTaskAtomic = vi.fn(async (_id: string, updater: (current: Task) => Promise<unknown>) => {
      const patch = await updater(live);
      return patch ? { ...live, ...(patch as object) } : live;
    });
    const store = {
      // Neither legacy input may replace the route persisted by the locked move.
      getSettings: vi.fn(async () => ({ defaultNodeId: "node-changed-default" })),
      getTask: vi.fn(async () => live),
      updateTaskAtomic,
      withPlanningLifecycleLock: vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback()),
      withTaskMutationLock: vi.fn(async (_id: string, callback: () => Promise<Task | null>) => callback()),
      getTaskWorkflowSelectionAsync: vi.fn(async () => undefined),
      getWorkflowDefinition: vi.fn(async () => undefined),
      getRootDir: vi.fn(() => "/tmp/project"),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as TaskStore;
    const scheduler = new Scheduler(store, {
      localNodeId: "node-registry-local",
      registryLocalNodeId: "node-registry-local",
    });
    const persist = (scheduler as unknown as {
      persistReleasedDispatchIfStillOwned(id: string, patch: { status: null }): Promise<Task | null>;
    }).persistReleasedDispatchIfStillOwned.bind(scheduler);

    await expect(persist(live.id, { status: null })).resolves.toMatchObject({
      effectiveNodeSource: "local",
      status: null,
    });
    expect(updateTaskAtomic).toHaveBeenCalledOnce();
  });
});
