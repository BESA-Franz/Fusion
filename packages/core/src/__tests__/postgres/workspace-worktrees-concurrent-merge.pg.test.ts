import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSharedPgTaskStoreTestHarness, pgDescribe, type SharedPgTaskStoreHarness } from "../../__test-utils__/pg-test-harness.js";
import { isWorkspaceTask } from "../../types.js";

const pgTest = pgDescribe;

/*
FNXC:Workspace 2026-08-15-07:51:
These tests use distinct TaskStore handles against one PostgreSQL database. An in-process mutex
would make the concurrent cases pass accidentally; only the task advisory transaction lock makes
both independently issued per-repo merges retain their sibling entries.
*/
pgTest("workspace worktree per-repo atomic merge (PostgreSQL)", () => {
  const h: SharedPgTaskStoreHarness = createSharedPgTaskStoreTestHarness({ prefix: "fusion_workspace_merge" });

  beforeAll(h.beforeAll);
  beforeEach(h.beforeEach);
  afterEach(h.afterEach);
  afterAll(h.afterAll);

  it("retains both different repo keys from genuinely concurrent store handles", async () => {
    const first = h.store();
    const second = h.store();
    const task = await first.createTask({ description: "concurrent workspace merges" });

    await Promise.all([
      first.mergeWorkspaceWorktreeEntry(task.id, "repo-a", { worktreePath: "/tmp/repo-a", branch: "fusion/a", baseCommitSha: "base-a" }),
      second.mergeWorkspaceWorktreeEntry(task.id, "repo-b", { worktreePath: "/tmp/repo-b", branch: "fusion/b", baseCommitSha: "base-b" }),
    ]);

    const current = await first.getTask(task.id);
    expect(current.workspaceWorktrees).toEqual({
      "repo-a": { worktreePath: "/tmp/repo-a", branch: "fusion/a", baseCommitSha: "base-a" },
      "repo-b": { worktreePath: "/tmp/repo-b", branch: "fusion/b", baseCommitSha: "base-b" },
    });
  });

  it("preserves an existing entry while a sibling is added concurrently", async () => {
    const first = h.store();
    const second = h.store();
    const task = await first.createTask({ description: "landed SHA and acquisition" });
    await first.mergeWorkspaceWorktreeEntry(task.id, "repo-a", {
      worktreePath: "/tmp/repo-a", branch: "fusion/a", baseCommitSha: "base-a",
    });

    await Promise.all([
      first.mergeWorkspaceWorktreeEntry(task.id, "repo-a", { landedSha: "landed-a" }, { requireExistingEntry: true }),
      second.mergeWorkspaceWorktreeEntry(task.id, "repo-b", { worktreePath: "/tmp/repo-b", branch: "fusion/b" }),
    ]);

    expect((await first.getTask(task.id)).workspaceWorktrees).toEqual({
      "repo-a": { worktreePath: "/tmp/repo-a", branch: "fusion/a", baseCommitSha: "base-a", landedSha: "landed-a" },
      "repo-b": { worktreePath: "/tmp/repo-b", branch: "fusion/b" },
    });
  });

  it("clears singular state in the same per-key update", async () => {
    const store = h.store();
    const task = await store.createTask({ description: "workspace singular state" });
    await store.updateTask(task.id, { worktree: "/tmp/legacy", branch: "fusion/legacy" });

    const updated = await store.mergeWorkspaceWorktreeEntry(task.id, "repo-a", {
      worktreePath: "/tmp/repo-a", branch: "fusion/a",
    }, { clearSingularWorktree: true });

    expect(updated.worktree).toBeUndefined();
    expect(updated.branch).toBeUndefined();
    expect(isWorkspaceTask(updated)).toBe(true);
  });

  it("does not create an absent required entry or clobber siblings", async () => {
    const store = h.store();
    const task = await store.createTask({ description: "required entry no-op" });
    await store.mergeWorkspaceWorktreeEntry(task.id, "repo-a", { worktreePath: "/tmp/repo-a", branch: "fusion/a" });

    const unchanged = await store.mergeWorkspaceWorktreeEntry(task.id, "repo-b", { landedSha: "ignored" }, { requireExistingEntry: true });
    expect(unchanged.workspaceWorktrees).toEqual({ "repo-a": { worktreePath: "/tmp/repo-a", branch: "fusion/a" } });
  });

  it.each([undefined, {}] as const)("creates one entry from %j workspace state", async (workspaceWorktrees) => {
    const store = h.store();
    const task = await store.createTask({ description: "empty workspace state" });
    if (workspaceWorktrees) await store.updateTask(task.id, { workspaceWorktrees });

    const updated = await store.mergeWorkspaceWorktreeEntry(task.id, "repo-a", { worktreePath: "/tmp/repo-a", branch: "fusion/a" });
    expect(updated.workspaceWorktrees).toEqual({ "repo-a": { worktreePath: "/tmp/repo-a", branch: "fusion/a" } });
  });
});

void describe;
