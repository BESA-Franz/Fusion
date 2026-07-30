import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { DEFAULT_SETTINGS, type Settings, type TaskDetail, type TaskStore } from "@fusion/core";
import { TaskExecutor } from "../../executor.js";
import { inspectBranchConflict } from "../../branch-conflicts.js";

const hasGit = spawnSync("git", ["--version"], { stdio: "pipe" }).status === 0;
const describeIfGit = hasGit ? describe : describe.skip;

interface ExecutorTestSeams {
  cleanupConflictingWorktree(worktreePath: string, branch: string, taskId: string): Promise<boolean>;
  prepareGraphNodeExecution(
    node: {
      id: string;
      kind: "prompt";
      config: { name: string; prompt: string };
    },
    task: TaskDetail,
    settings: Settings,
    requirement: { requiresWorktree: boolean },
  ): Promise<void>;
}

function executorTestSeams(executor: TaskExecutor): ExecutorTestSeams {
  return executor as unknown as ExecutorTestSeams;
}

function git(cwd: string, command: string): string {
  return execSync(command, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

describeIfGit("missing reviewer worktree preservation", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      dirs.splice(0).map((dir) =>
        rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
      ),
    );
  });

  it("refuses to delete the task branch and checkout when they contain an unpushed commit", async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "fusion-missing-reviewer-wt-"));
    dirs.push(repoDir);
    const worktreesDir = join(repoDir, ".worktrees");
    const preservedWorktree = join(worktreesDir, "early-ridge");
    const branch = "fusion/besa-036";
    const taskId = "BESA-036";

    git(repoDir, "git init -b main");
    git(repoDir, 'git config user.email "test@example.com"');
    git(repoDir, 'git config user.name "Test User"');
    await writeFile(join(repoDir, "README.md"), "base\n", "utf-8");
    git(repoDir, "git add README.md");
    git(repoDir, 'git commit -m "chore: init"');
    await mkdir(worktreesDir, { recursive: true });
    git(repoDir, `git worktree add -b ${JSON.stringify(branch)} ${JSON.stringify(preservedWorktree)} main`);

    await writeFile(join(preservedWorktree, "implementation.ts"), "export const implemented = true;\n", "utf-8");
    git(preservedWorktree, "git add implementation.ts");
    git(preservedWorktree, 'git commit -m "implement requested behavior"');
    const preservedTip = git(preservedWorktree, "git rev-parse HEAD");

    const store = {
      on: () => undefined,
      listTasks: vi.fn(async () => []),
      getSettings: vi.fn(async () => ({ worktreesDir: ".worktrees" })),
      logEntry: vi.fn(async () => undefined),
      clearStaleExecutionStartBranchReferences: vi.fn(async () => undefined),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, repoDir);

    const cleaned = await executorTestSeams(executor).cleanupConflictingWorktree(
      preservedWorktree,
      branch,
      taskId,
    );

    expect(cleaned).toBe(false);
    expect(existsSync(preservedWorktree)).toBe(true);
    expect(git(repoDir, `git rev-parse ${JSON.stringify(branch)}`)).toBe(preservedTip);
    expect(git(preservedWorktree, "git status --porcelain")).toBe("");
  });

  it("refuses to delete an unpushed task branch after its recorded checkout has disappeared", async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "fusion-missing-branch-wt-"));
    dirs.push(repoDir);
    const worktreesDir = join(repoDir, ".worktrees");
    const missingWorktree = join(worktreesDir, "early-ridge");
    const branch = "fusion/besa-036";
    const taskId = "BESA-036";

    git(repoDir, "git init -b main");
    git(repoDir, 'git config user.email "test@example.com"');
    git(repoDir, 'git config user.name "Test User"');
    await writeFile(join(repoDir, "README.md"), "base\n", "utf-8");
    git(repoDir, "git add README.md");
    git(repoDir, 'git commit -m "chore: init"');
    await mkdir(worktreesDir, { recursive: true });
    git(repoDir, `git worktree add -b ${JSON.stringify(branch)} ${JSON.stringify(missingWorktree)} main`);
    await writeFile(join(missingWorktree, "implementation.ts"), "export const implemented = true;\n", "utf-8");
    git(missingWorktree, "git add implementation.ts");
    git(missingWorktree, 'git commit -m "implement requested behavior"');
    const preservedTip = git(missingWorktree, "git rev-parse HEAD");
    git(repoDir, `git worktree remove ${JSON.stringify(missingWorktree)}`);
    expect(existsSync(missingWorktree)).toBe(false);

    const store = {
      on: () => undefined,
      listTasks: vi.fn(async () => []),
      getSettings: vi.fn(async () => ({ worktreesDir: ".worktrees" })),
      logEntry: vi.fn(async () => undefined),
      clearStaleExecutionStartBranchReferences: vi.fn(async () => undefined),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, repoDir);

    const cleaned = await executorTestSeams(executor).cleanupConflictingWorktree(
      missingWorktree,
      branch,
      taskId,
    );

    expect(cleaned).toBe(false);
    expect(git(repoDir, `git rev-parse ${JSON.stringify(branch)}`)).toBe(preservedTip);
  });

  it("refuses to remove a registered checkout with only dirty work", async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "fusion-dirty-reviewer-wt-"));
    dirs.push(repoDir);
    const worktreesDir = join(repoDir, ".worktrees");
    const preservedWorktree = join(worktreesDir, "early-ridge");
    const branch = "fusion/besa-036";
    const taskId = "BESA-036";

    git(repoDir, "git init -b main");
    git(repoDir, 'git config user.email "test@example.com"');
    git(repoDir, 'git config user.name "Test User"');
    await writeFile(join(repoDir, "README.md"), "base\n", "utf-8");
    git(repoDir, "git add README.md");
    git(repoDir, 'git commit -m "chore: init"');
    await mkdir(worktreesDir, { recursive: true });
    git(repoDir, `git worktree add -b ${JSON.stringify(branch)} ${JSON.stringify(preservedWorktree)} main`);
    await writeFile(join(preservedWorktree, "review-notes.txt"), "still in progress\n", "utf-8");

    const store = {
      on: () => undefined,
      listTasks: vi.fn(async () => []),
      getSettings: vi.fn(async () => ({ worktreesDir: ".worktrees" })),
      logEntry: vi.fn(async () => undefined),
      clearStaleExecutionStartBranchReferences: vi.fn(async () => undefined),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, repoDir);

    const cleaned = await executorTestSeams(executor).cleanupConflictingWorktree(
      preservedWorktree,
      branch,
      taskId,
    );

    expect(cleaned).toBe(false);
    expect(existsSync(preservedWorktree)).toBe(true);
    expect(git(preservedWorktree, "git status --porcelain")).toContain("review-notes.txt");
  });

  it("reclaims the surviving BESA task checkout when missing-reviewer recovery spells its path differently", async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "fusion-reviewer-reclaim-"));
    dirs.push(repoDir);
    const worktreesDir = join(repoDir, ".worktrees");
    const preservedWorktree = join(worktreesDir, "early-ridge");
    const branch = "fusion/besa-036";

    git(repoDir, "git init -b main");
    git(repoDir, 'git config user.email "test@example.com"');
    git(repoDir, 'git config user.name "Test User"');
    await writeFile(join(repoDir, "README.md"), "base\n", "utf-8");
    git(repoDir, "git add README.md");
    git(repoDir, 'git commit -m "chore: init"');
    await mkdir(worktreesDir, { recursive: true });
    git(repoDir, `git worktree add -b ${JSON.stringify(branch)} ${JSON.stringify(preservedWorktree)} main`);
    await writeFile(join(preservedWorktree, "implementation.ts"), "export const implemented = true;\n", "utf-8");
    git(preservedWorktree, "git add implementation.ts");
    git(preservedWorktree, 'git commit -m "implement requested behavior"');

    const equivalentConflictPath = `${preservedWorktree}${sep}..${sep}early-ridge`;
    const inspection = await inspectBranchConflict({
      repoDir,
      branchName: branch,
      conflictingWorktreePath: equivalentConflictPath,
      requestingTaskId: "BESA-036",
      ownerTaskId: "BESA-036",
      startPoint: "main",
      integrationRef: "main",
    });

    expect(inspection.kind).toBe("reclaimable");
    if (inspection.kind !== "reclaimable") throw new Error("expected same-task checkout to be reclaimable");
    expect(inspection.livePath.replaceAll("\\", "/")).toBe(preservedWorktree.replaceAll("\\", "/"));
  });

  it("rebinds a missing Code Review worktree to the surviving task checkout without cleanup", async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "fusion-reviewer-prepare-"));
    dirs.push(repoDir);
    const worktreesDir = join(repoDir, ".worktrees");
    const preservedWorktree = join(worktreesDir, "early-ridge");
    const missingRecordedWorktree = join(worktreesDir, "missing-reviewer");
    const branch = "fusion/besa-036";
    const taskId = "BESA-036";

    git(repoDir, "git init -b main");
    git(repoDir, 'git config user.email "test@example.com"');
    git(repoDir, 'git config user.name "Test User"');
    await writeFile(join(repoDir, "README.md"), "base\n", "utf-8");
    git(repoDir, "git add README.md");
    git(repoDir, 'git commit -m "chore: init"');
    await mkdir(worktreesDir, { recursive: true });
    git(repoDir, `git worktree add -b ${JSON.stringify(branch)} ${JSON.stringify(preservedWorktree)} main`);
    await writeFile(join(preservedWorktree, "implementation.ts"), "export const implemented = true;\n", "utf-8");
    git(preservedWorktree, "git add implementation.ts");
    git(preservedWorktree, 'git commit -m "implement requested behavior"');
    const preservedTip = git(preservedWorktree, "git rev-parse HEAD");

    const now = new Date().toISOString();
    let live = {
      id: taskId,
      title: "Preserve implementation for review",
      description: "Review the surviving implementation commit",
      column: "in-progress",
      dependencies: [],
      steps: [{ name: "Implementation", status: "done" }],
      currentStep: 0,
      log: [],
      worktree: missingRecordedWorktree,
      branch,
      baseBranch: "main",
      status: null,
      error: null,
      paused: false,
      userPaused: false,
      createdAt: now,
      updatedAt: now,
    } as TaskDetail;
    const settings = {
      ...DEFAULT_SETTINGS,
      worktreesDir: ".worktrees",
      worktreeNaming: "random" as const,
      recycleWorktrees: false,
      worktreeInitCommand: "",
      worktreeCopyFiles: [],
    };
    const store = {
      on: () => undefined,
      getTask: vi.fn(async () => live),
      updateTask: vi.fn(async (_id: string, updates: Partial<TaskDetail>) => {
        live = { ...live, ...updates } as TaskDetail;
        return live;
      }),
      listTasks: vi.fn(async () => [live]),
      getSettings: vi.fn(async () => settings),
      logEntry: vi.fn(async () => undefined),
      clearStaleExecutionStartBranchReferences: vi.fn(async () => undefined),
    } as unknown as TaskStore;
    const executor = new TaskExecutor(store, repoDir);
    const seams = executorTestSeams(executor);
    const cleanupSpy = vi.spyOn(seams, "cleanupConflictingWorktree");

    await seams.prepareGraphNodeExecution(
      {
        id: "code-review-step",
        kind: "prompt",
        config: { name: "Code Review", prompt: "Review the implementation." },
      },
      live,
      settings,
      { requiresWorktree: true },
    );

    expect(live.worktree?.replaceAll("\\", "/")).toBe(preservedWorktree.replaceAll("\\", "/"));
    expect(cleanupSpy).not.toHaveBeenCalled();
    expect(existsSync(preservedWorktree)).toBe(true);
    expect(git(repoDir, `git rev-parse ${JSON.stringify(branch)}`)).toBe(preservedTip);
    expect(store.logEntry).toHaveBeenCalledWith(
      taskId,
      expect.stringContaining("assigned worktree is missing"),
      missingRecordedWorktree,
      undefined,
    );
  });
});
