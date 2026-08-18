import { beforeEach, describe, expect, it, vi } from "vitest";
import "./executor-test-helpers.js";
import { TaskExecutor } from "../executor.js";
import type { Task } from "@fusion/core";
import { createMockStore, mockedExec, mockedExecSync, resetExecutorMocks } from "./executor-test-helpers.js";
import { resetStepsIfWorkLost } from "../executor/reset-steps-if-work-lost.js";

describe("TaskExecutor.resetStepsIfWorkLost", () => {
  beforeEach(() => {
    resetExecutorMocks();
  });

  it("resets completed steps and recomputes currentStep when branch has no unique commits", async () => {
    const store = createMockStore();
    const task: Task = {
      id: "FN-4990",
      title: "Reset steps",
      description: "desc",
      column: "in-progress",
      dependencies: [],
      steps: [
        { name: "Step 1", status: "done" },
        { name: "Step 2", status: "done" },
        { name: "Step 3", status: "done" },
        { name: "Step 4", status: "pending" },
        { name: "Step 5", status: "pending" },
      ],
      currentStep: 3,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branch: "fusion/fn-4990",
    };

    store.getTask.mockImplementation(async () => task);
    store.updateStep.mockImplementation(async (_taskId: string, stepIndex: number, status: Task["steps"][number]["status"]) => {
      task.steps[stepIndex].status = status;
      return task;
    });
    store.updateTask.mockImplementation(async (_taskId: string, updates: Partial<Task>) => {
      Object.assign(task, updates);
      return task;
    });

    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("git merge-base")) return "abc123\n";
      if (cmd.includes("git rev-parse")) return "abc123\n";
      return "";
    });

    const executor = new TaskExecutor(store as any, "/tmp/test");
    await (executor as any).resetStepsIfWorkLost(task);

    expect(task.steps[0].status).toBe("pending");
    expect(task.steps[1].status).toBe("pending");
    expect(task.steps[2].status).toBe("pending");
    expect(task.currentStep).toBe(0);
    expect(store.logEntry).toHaveBeenCalledWith(
      task.id,
      expect.stringContaining("currentStep"),
    );
  });

  it("proves branch durability without POSIX redirection", async () => {
    const resetLostWorkStepProgress = vi.fn(async () => undefined);
    const task = {
      id: "FN-4991",
      title: "Portable durability proof",
      description: "desc",
      column: "in-progress",
      dependencies: [],
      steps: [{ name: "Step 1", status: "done" }],
      currentStep: 1,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branch: "fusion/fn-4991",
    } as Task;
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("merge-base")) return "branch-sha\n";
      if (cmd.includes("rev-parse")) return "branch-sha\n";
      return "";
    });

    await resetStepsIfWorkLost({ rootDir: "C:/repo", resetLostWorkStepProgress }, task);

    const commands = mockedExec.mock.calls.map(([command]) => String(command));
    expect(commands).toEqual([
      process.platform === "win32"
        ? 'git merge-base "fusion/fn-4991" HEAD'
        : "git merge-base 'fusion/fn-4991' HEAD",
      process.platform === "win32"
        ? 'git rev-parse "fusion/fn-4991"'
        : "git rev-parse 'fusion/fn-4991'",
    ]);
    expect(commands.join(" ")).not.toContain("2>/dev/null");
    expect(resetLostWorkStepProgress).toHaveBeenCalledWith(task, 1, "branch had no commits");
  });

  it("resets fail-closed when the branch proof cannot resolve", async () => {
    const resetLostWorkStepProgress = vi.fn(async () => undefined);
    const task = {
      id: "FN-4992",
      title: "Missing branch",
      description: "desc",
      column: "in-progress",
      dependencies: [],
      steps: [{ name: "Step 1", status: "in-progress" }],
      currentStep: 0,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branch: "fusion/missing-fn-4992",
    } as Task;
    mockedExecSync.mockImplementation(() => {
      throw new Error("fatal: unknown revision");
    });

    await resetStepsIfWorkLost({ rootDir: "C:/repo", resetLostWorkStepProgress }, task);

    expect(resetLostWorkStepProgress).toHaveBeenCalledWith(
      task,
      1,
      expect.stringContaining("git proof failed: fatal: unknown revision"),
    );
  });
});
