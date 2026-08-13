import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskStore } from "@fusion/core";

import { TriageProcessor } from "../triage.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-FOREIGN-PLANNING",
    title: "Foreign planning task",
    description: "Must only be planned on the assigned runtime",
    column: "todo",
    priority: "medium",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    nodeId: "node-pc1",
    ...overrides,
  } as Task;
}

function store(current: Task): TaskStore {
  return {
    getTask: vi.fn(async () => current),
    getSettings: vi.fn(async () => ({ defaultNodeId: undefined })),
    updateTask: vi.fn(async () => undefined),
    moveTask: vi.fn(async () => undefined),
    logEntry: vi.fn(async () => undefined),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as TaskStore;
}

const processors: TriageProcessor[] = [];

afterEach(() => {
  processors.splice(0).forEach((processor) => processor.stop());
});

describe("TriageProcessor runtime node boundary", () => {
  it("filters a foreign route before workflow or PROMPT discovery", async () => {
    const current = task();
    const taskStore = store(current);
    const processor = new TriageProcessor(taskStore, "/tmp/fusion-node-routing", {
      localNodeId: "node-vps",
      acceptUnassignedTasks: true,
    });
    processors.push(processor);

    const found = await (processor as unknown as {
      discoverReadyPlanningTasks(tasks: Task[], now: number, settings: { defaultNodeId?: string }): Promise<Task[]>;
    }).discoverReadyPlanningTasks([current], Date.now(), { defaultNodeId: undefined });

    expect(found).toEqual([]);
    expect(taskStore.getTaskWorkflowSelectionAsync).toBeUndefined();
  });

  it("re-checks ownership at planner entry and performs no task mutation", async () => {
    const current = task();
    const taskStore = store(current);
    const processor = new TriageProcessor(taskStore, "/tmp/fusion-node-routing", {
      localNodeId: "node-vps",
      acceptUnassignedTasks: true,
    });
    processors.push(processor);

    await processor.specifyTask(current);

    expect(taskStore.getTask).toHaveBeenCalledWith(current.id);
    expect(taskStore.updateTask).not.toHaveBeenCalled();
    expect(taskStore.moveTask).not.toHaveBeenCalled();
    expect(taskStore.logEntry).not.toHaveBeenCalled();
  });
});
