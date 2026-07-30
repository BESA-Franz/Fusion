import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Settings, Task, TaskStore } from "@fusion/core";
import { commitOrAmendMergeWithFixes } from "../../merger.js";
import { SelfHealingManager } from "../../self-healing.js";

function git(dir: string, cmd: string): string {
  return execSync(cmd, { cwd: dir, stdio: "pipe" }).toString().trim();
}

interface BranchMisboundTestManager {
  readCommitTaskOwnership(...args: unknown[]): Promise<unknown>;
  foreignTipRejection(...args: unknown[]): Promise<unknown>;
  findAlreadyMergedTaskCommit(...args: unknown[]): Promise<unknown>;
  clearCompletionBranchIfSubsumed(...args: unknown[]): Promise<boolean>;
  reconcileCompletedTask(...args: unknown[]): Promise<unknown>;
  recoverBranchMisboundInReviewTasks(): Promise<number>;
}

function exposeBranchMisboundMethods(manager: SelfHealingManager): BranchMisboundTestManager {
  return manager as unknown as BranchMisboundTestManager;
}

function makeStore(task: Task, settings: Partial<Settings> = {}): TaskStore & EventEmitter {
  const emitter = new EventEmitter();
  const allSettings = { globalPause: false, enginePaused: false, ...settings } as Settings;
  return Object.assign(emitter, {
    getSettings: async () => allSettings,
    listTasks: async ({ column }: { column?: string } = {}) => (column ? [task].filter((t) => t.column === column) : [task]),
    updateTask: async (_id: string, updates: Partial<Task>) => Object.assign(task, updates),
    moveTask: async (_id: string, column: Task["column"]) => { task.column = column; },
    logEntry: async () => undefined,
    getTask: async () => task,
    walCheckpoint: () => ({ busy: 0, log: 0, checkpointed: 0 }),
    archiveTaskAndCleanup: async () => ({}),
    clearStaleExecutionStartBranchReferences: () => [],
    updateSettings: async () => allSettings,
    mergeTask: async () => undefined,
    getRootDir: () => "",
    recordRunAuditEvent: async () => undefined,
  }) as unknown as TaskStore & EventEmitter;
}

describe("verification-fix already-on-main reliability interactions (real git)", () => {
  it.runIf(process.platform === "win32")("recovers a slash branch without passing literal POSIX quotes to real Git", async () => {
    const dir = mkdtempSync(join(tmpdir(), "branch-misbound-win32-"));
    try {
      git(dir, "git init -b main");
      git(dir, 'git config user.email "test@example.com"');
      git(dir, 'git config user.name "Test"');
      git(dir, "git commit --allow-empty -m init");
      git(dir, "git branch fusion/besa-027");
      const expectedTip = git(dir, "git rev-parse fusion/besa-027");

      const task = {
        id: "BESA-027",
        title: "t",
        description: "d",
        column: "in-review",
        dependencies: [],
        steps: [],
        currentStep: 0,
        log: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        branch: "fusion/besa-027",
        baseBranch: "main",
      } as Task;
      const manager = exposeBranchMisboundMethods(
        new SelfHealingManager(makeStore(task), {
          rootDir: dir,
          getExecutingTaskIds: () => new Set(),
        }),
      );
      vi.spyOn(manager, "readCommitTaskOwnership").mockResolvedValue({
        owned: false,
        ownerTaskId: undefined,
        ownerLineageId: undefined,
      });
      vi.spyOn(manager, "foreignTipRejection").mockResolvedValue(null);
      vi.spyOn(manager, "findAlreadyMergedTaskCommit").mockResolvedValue({
        sha: expectedTip,
        strategy: "ancestry",
        ownershipProof: "task-trailer",
      });
      vi.spyOn(manager, "clearCompletionBranchIfSubsumed").mockResolvedValue(true);
      vi.spyOn(manager, "reconcileCompletedTask").mockResolvedValue(undefined);

      await expect(manager.recoverBranchMisboundInReviewTasks()).resolves.toBe(1);
      expect(task).toMatchObject({
        column: "done",
        branch: null,
        mergeDetails: {
          commitSha: expectedTip,
          mergeConfirmed: true,
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("recovers no-content finalize and allows self-healing done transition", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fn-4559-ri-"));
    try {
      git(dir, "git init -b main");
      git(dir, 'git config user.email "test@example.com"');
      git(dir, 'git config user.name "Test"');
      git(dir, "git commit --allow-empty -m init");

      git(dir, "git commit --allow-empty -m 'feat(FN-4545): unrelated'");
      const unrelatedSha = git(dir, "git rev-parse HEAD");
      writeFileSync(join(dir, "file.txt"), "task\n");
      git(dir, "git add file.txt");
      git(dir, "git commit -m 'feat(FN-4553): landed' -m 'Fusion-Task-Id: FN-4553'");
      const landedSha = git(dir, "git rev-parse HEAD");
      git(dir, "git commit --allow-empty -m 'chore: post'");
      const preAttemptHeadSha = git(dir, "git rev-parse HEAD");

      git(dir, `git branch fusion/fn-4553 ${unrelatedSha}`);

      const finalized = await commitOrAmendMergeWithFixes(
        dir,
        "FN-4553",
        "fusion/fn-4553",
        "feat(FN-4553): merge",
        true,
        preAttemptHeadSha,
        "",
        undefined,
        undefined,
        undefined,
        null,
        null,
        null,
        new Set<string>(),
      );
      expect(finalized.ok && finalized.reason === "branch-already-merged-on-main").toBe(true);
      if (finalized.ok && finalized.reason === "branch-already-merged-on-main") {
        expect(finalized.mergeSha).toBe(landedSha);
      }

      const task = {
        id: "FN-4553",
        title: "t",
        description: "d",
        column: "in-review",
        dependencies: [],
        steps: [],
        currentStep: 0,
        log: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        branch: "fusion/fn-4553",
        baseBranch: "main",
      } as Task;
      const store = makeStore(task);
      const manager = new SelfHealingManager(store, { rootDir: dir, getExecutingTaskIds: () => new Set() });
      await exposeBranchMisboundMethods(manager).recoverBranchMisboundInReviewTasks();
      expect(task.column).toBe("done");

      const pausedStore = makeStore({ ...task, id: "FN-4553B", column: "in-review", branch: "fusion/fn-4553" } as Task, { globalPause: true });
      const pausedMgr = new SelfHealingManager(pausedStore, { rootDir: dir, getExecutingTaskIds: () => new Set() });
      await expect(exposeBranchMisboundMethods(pausedMgr).recoverBranchMisboundInReviewTasks()).resolves.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
