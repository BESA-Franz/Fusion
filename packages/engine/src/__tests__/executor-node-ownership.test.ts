import { describe, expect, it, vi } from "vitest";
import type { Task, TaskStore } from "@fusion/core";
import { TaskExecutor } from "../executor.js";

const makeTask = (nodeId?: string): Task => ({
  id: "FN-EXEC-NODE",
  title: "Node-owned execution",
  description: "",
  column: "in-progress",
  nodeId,
  dependencies: [],
  steps: [],
  currentStep: 0,
  log: [],
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
} as Task);

describe("TaskExecutor node ownership", () => {
  it("re-reads the route and refuses a task moved to another process", async () => {
    const foreign = makeTask("node-pc2");
    const store = {
      on: vi.fn(),
      off: vi.fn(),
      getTask: vi.fn(async () => foreign),
      getSettings: vi.fn(async () => ({})),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, "/tmp/executor-node-owner", {
      getLocalNodeId: () => "node-vps",
      getRegistryLocalNodeId: () => "node-vps",
    });
    const executeCore = vi.spyOn(executor as never, "executeCore" as never).mockResolvedValue(undefined as never);

    await executor.execute(makeTask("node-vps"));

    expect(store.getTask).toHaveBeenCalledWith("FN-EXEC-NODE");
    expect(executeCore).not.toHaveBeenCalled();
  });

  it("assigns an unbound task only to the registry-local process", async () => {
    const unbound = makeTask();
    const store = {
      on: vi.fn(),
      off: vi.fn(),
      getTask: vi.fn(async () => unbound),
      getSettings: vi.fn(async () => ({})),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, "/tmp/executor-node-owner", {
      getLocalNodeId: () => "node-pc2",
      getRegistryLocalNodeId: () => "node-vps",
    });
    const executeCore = vi.spyOn(executor as never, "executeCore" as never).mockResolvedValue(undefined as never);

    await executor.execute(unbound);

    expect(executeCore).not.toHaveBeenCalled();
  });

  it("refuses completed-task recovery after ownership moved to another node", async () => {
    const store = {
      on: vi.fn(),
      off: vi.fn(),
      getTask: vi.fn(async () => makeTask("node-pc2")),
      getSettings: vi.fn(async () => ({})),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, "/tmp/executor-node-owner", {
      getLocalNodeId: () => "node-vps",
      getRegistryLocalNodeId: () => "node-vps",
    });

    await expect(executor.recoverCompletedTask(makeTask("node-vps"))).resolves.toBe(false);
  });

  it("refuses an owned task that left the WIP lane before execute", async () => {
    const review = { ...makeTask("node-vps"), column: "in-review" } as Task;
    const store = {
      on: vi.fn(),
      off: vi.fn(),
      getTask: vi.fn(async () => review),
      getSettings: vi.fn(async () => ({})),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, "/tmp/executor-node-owner", {
      getLocalNodeId: () => "node-vps",
      getRegistryLocalNodeId: () => "node-vps",
    });
    vi.spyOn(executor as never, "resolveResumeLanes" as never).mockResolvedValue({ wip: "in-progress" } as never);
    const executeCore = vi.spyOn(executor as never, "executeCore" as never).mockResolvedValue(undefined as never);

    await executor.execute(review);

    expect(executeCore).not.toHaveBeenCalled();
  });
});
