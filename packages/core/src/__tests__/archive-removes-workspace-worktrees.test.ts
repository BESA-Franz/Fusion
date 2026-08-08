import {describe, expect, it, vi} from "vitest";
import {join} from "node:path";
import {
  ArchiveWorkspaceDisposalError,
  ArchiveWorkspaceDisposalIncompleteError,
  ArchiveWorkspaceWorktreeDisposerMissingError,
  getArchiveWorkspaceWorktreeDisposer,
  registerArchiveWorkspaceWorktreeDisposer,
  type TaskStore,
} from "../index.js";
import {buildWorkspaceDisposalPlan, disposeArchivedWorkspaceWorktrees} from "../task-store/archive-lifecycle.js";

describe("workspace archive worktree disposer seam", () => {
  it("is store scoped and identity-guarded during executor replacement", async () => {
    const storeA = {} as TaskStore;
    const storeB = {} as TaskStore;
    const baseline = async () => ({removed: [], failed: []});
    const executor = async () => ({removed: [], failed: []});
    const removeBaseline = registerArchiveWorkspaceWorktreeDisposer(storeA, baseline);
    registerArchiveWorkspaceWorktreeDisposer(storeB, executor);
    const removeExecutor = registerArchiveWorkspaceWorktreeDisposer(storeA, executor);

    removeBaseline();
    expect(getArchiveWorkspaceWorktreeDisposer(storeA)).toBe(executor);
    expect(getArchiveWorkspaceWorktreeDisposer(storeB)).toBe(executor);
    removeExecutor();
    expect(getArchiveWorkspaceWorktreeDisposer(storeA)).toBeUndefined();
    expect(getArchiveWorkspaceWorktreeDisposer(storeB)).toBe(executor);
  });

  it("retains typed outcome identity for incomplete and missing removal handling", () => {
    expect(new ArchiveWorkspaceDisposalError("partial", ["repo-a"], [{repoRel: "repo-b", error: new Error("failed")}]).removed).toEqual(["repo-a"]);
    expect(new ArchiveWorkspaceDisposalIncompleteError("repo-c").message).toContain("repo-c");
    expect(new ArchiveWorkspaceWorktreeDisposerMissingError("repo-d").message).toContain("repo-d");
  });

  it("releases rather than quarantines an explicitly skipped remote-node path", async () => {
    const store = {} as TaskStore;
    const quarantine = vi.fn(async () => {});
    const release = vi.fn(async () => {});
    const unregister = registerArchiveWorkspaceWorktreeDisposer(store, async () => ({
      removed: [],
      skipped: ["repo-a"],
      failed: [],
    }));

    try {
      await disposeArchivedWorkspaceWorktrees(store, {} as never, {
        plan: [{
          repoRel: "repo-a",
          worktreePath: "/remote/repo-a-worktree",
          branch: "fusion/remote",
          repoRootDir: "/local/repo-a",
          aliasRepoRels: [],
        }],
        reservations: {
          "repo-a": {
            canonicalPath: "/remote/repo-a-worktree",
            token: "reservation-token",
            previousState: "free",
            state: "held",
            release,
            quarantine,
          },
        },
        singularDeduplicated: false,
      });
    } finally {
      unregister();
    }

    expect(quarantine).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("builds one deterministic plan entry for aliases and a colliding singular path", async () => {
    const rootDir = "/workspace";
    const shared = join(rootDir, ".worktrees", "shared");
    const task = {
      worktree: shared,
      workspaceWorktrees: {
        "repo-b": {worktreePath: shared, branch: "fusion/b"},
        "repo-a": {worktreePath: shared, branch: "fusion/a"},
      },
    } as never;

    const {plan, singularDeduplicated} = await buildWorkspaceDisposalPlan({rootDir} as TaskStore, task);

    expect(plan).toEqual([{
      repoRel: "repo-a",
      worktreePath: shared,
      branch: "fusion/a",
      repoRootDir: join(rootDir, "repo-a"),
      aliasRepoRels: ["repo-b", "__singular_worktree__"],
    }]);
    expect(singularDeduplicated).toBe(true);
  });
});
