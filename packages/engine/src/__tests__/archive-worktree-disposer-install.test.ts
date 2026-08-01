import {afterEach, describe, expect, it, vi} from "vitest";
import {execFile} from "node:child_process";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {
  getArchiveWorkspaceWorktreeDisposer,
  getArchiveWorktreeDisposer,
  type Task,
  type TaskStore,
  type WorkspaceDisposalPlanEntry,
} from "@fusion/core";

const {removeWorktreeMock} = vi.hoisted(() => ({
  removeWorktreeMock: vi.fn(async () => ({removed: true as const, classification: "removed" as const})),
}));

vi.mock("../worktree/worktree-backend.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worktree/worktree-backend.js")>();
  return {...actual, removeWorktree: removeWorktreeMock};
});

import {installBaselineArchiveWorktreeDisposer} from "../healing/archive-worktree-disposer-install.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, {cwd, timeout: 10_000});
}

async function createRepositoryFixture(label: string): Promise<{rootDir: string; worktreePath: string}> {
  const parent = await mkdtemp(join(tmpdir(), `fusion-archive-owner-${label}-`));
  tempRoots.push(parent);
  const rootDir = join(parent, "repo");
  const worktreePath = join(parent, "task-worktree");
  await mkdir(rootDir);
  await git(rootDir, ["init", "-b", "main"]);
  await git(rootDir, ["config", "user.email", "archive-test@example.invalid"]);
  await git(rootDir, ["config", "user.name", "Archive Test"]);
  await writeFile(join(rootDir, "README.md"), "fixture\n", "utf8");
  await git(rootDir, ["add", "README.md"]);
  await git(rootDir, ["commit", "-m", "fixture"]);
  await git(rootDir, ["worktree", "add", "-b", `fusion/${label}`, worktreePath, "HEAD"]);
  return {rootDir, worktreePath};
}

function taskWith(input: Pick<Task, "id" | "worktree" | "nodeId" | "effectiveNodeId">): Task {
  return input as Task;
}

afterEach(async () => {
  removeWorktreeMock.mockClear();
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, {recursive: true, force: true})));
});

describe("baseline archive worktree disposer node ownership", () => {
  it("skips a remote effective owner without invoking local removal", async () => {
    const fixture = await createRepositoryFixture("remote-owner");
    const store = {} as TaskStore;
    const unregister = installBaselineArchiveWorktreeDisposer(store, {
      rootDir: fixture.rootDir,
      getSettings: async () => ({}),
      getLocalNodeId: async () => "node-local",
    });
    const task = taskWith({
      id: "FN-REMOTE",
      worktree: fixture.worktreePath,
      nodeId: "node-local",
      effectiveNodeId: "node-remote",
    });

    try {
      await getArchiveWorktreeDisposer(store)!(task, {} as never);
    } finally {
      unregister();
    }

    expect(removeWorktreeMock).not.toHaveBeenCalled();
    expect(task.worktree).toBe(fixture.worktreePath);
  });

  it("reports remote workspace paths as skipped rather than failed or removed", async () => {
    const fixture = await createRepositoryFixture("remote-workspace-owner");
    const store = {} as TaskStore;
    const unregister = installBaselineArchiveWorktreeDisposer(store, {
      rootDir: fixture.rootDir,
      getSettings: async () => ({}),
      getLocalNodeId: () => "node-local",
    });
    const task = taskWith({
      id: "FN-REMOTE-WS",
      worktree: undefined,
      nodeId: "node-remote",
      effectiveNodeId: undefined,
    });
    const plan: WorkspaceDisposalPlanEntry[] = [{
      repoRel: "repo-a",
      worktreePath: fixture.worktreePath,
      branch: "fusion/remote-workspace-owner",
      repoRootDir: fixture.rootDir,
      aliasRepoRels: [],
    }];

    let result;
    try {
      result = await getArchiveWorkspaceWorktreeDisposer(store)!(task, plan, {});
    } finally {
      unregister();
    }

    expect(result).toEqual({removed: [], skipped: ["repo-a"], failed: []});
    expect(removeWorktreeMock).not.toHaveBeenCalled();
  });

  it("removes a local owner's worktree only after verifying repository registration", async () => {
    const fixture = await createRepositoryFixture("local-owner");
    const store = {} as TaskStore;
    const unregister = installBaselineArchiveWorktreeDisposer(store, {
      rootDir: fixture.rootDir,
      getSettings: async () => ({}),
      getLocalNodeId: () => "node-local",
    });
    const task = taskWith({
      id: "FN-LOCAL",
      worktree: fixture.worktreePath,
      nodeId: "node-remote",
      effectiveNodeId: "node-local",
    });

    try {
      await getArchiveWorktreeDisposer(store)!(task, {} as never);
    } finally {
      unregister();
    }

    expect(removeWorktreeMock).toHaveBeenCalledOnce();
    expect(removeWorktreeMock).toHaveBeenCalledWith(expect.objectContaining({
      rootDir: fixture.rootDir,
      worktreePath: fixture.worktreePath,
      taskId: "FN-LOCAL",
    }));
    expect(task.worktree).toBeUndefined();
  });

  it("uses the local node project mapping instead of the registry's foreign canonical path", async () => {
    const fixture = await createRepositoryFixture("mapped-local-owner");
    const store = {} as TaskStore;
    const unregister = installBaselineArchiveWorktreeDisposer(store, {
      rootDir: "/workspace",
      getSettings: async () => ({}),
      getLocalNodeId: () => "node-local",
      getLocalProjectPath: () => fixture.rootDir,
    });
    const task = taskWith({
      id: "FN-MAPPED-LOCAL",
      worktree: fixture.worktreePath,
      nodeId: "node-local",
      effectiveNodeId: "node-local",
    });

    try {
      await getArchiveWorktreeDisposer(store)!(task, {} as never);
    } finally {
      unregister();
    }

    expect(removeWorktreeMock).toHaveBeenCalledWith(expect.objectContaining({
      rootDir: fixture.rootDir,
      worktreePath: fixture.worktreePath,
      taskId: "FN-MAPPED-LOCAL",
    }));
    expect(task.worktree).toBeUndefined();
  });

  it("fails safely when a nominally local task points at another repository's worktree", async () => {
    const local = await createRepositoryFixture("local-repo");
    const foreign = await createRepositoryFixture("foreign-repo");
    const store = {} as TaskStore;
    const unregister = installBaselineArchiveWorktreeDisposer(store, {
      rootDir: local.rootDir,
      getSettings: async () => ({}),
      getLocalNodeId: () => "node-local",
    });
    const task = taskWith({
      id: "FN-MISMATCH",
      worktree: foreign.worktreePath,
      nodeId: "node-local",
      effectiveNodeId: "node-local",
    });

    try {
      await expect(getArchiveWorktreeDisposer(store)!(task, {} as never)).rejects.toThrow(
        "not registered to repository root",
      );
    } finally {
      unregister();
    }

    expect(removeWorktreeMock).not.toHaveBeenCalled();
    expect(task.worktree).toBe(foreign.worktreePath);
  });
});
