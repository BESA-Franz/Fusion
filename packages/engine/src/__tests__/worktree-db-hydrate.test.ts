import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hydrateWorktreeDb } from "../worktree-db-hydrate.js";

describe("hydrateWorktreeDb", () => {
  it("uses shared PostgreSQL storage and mirrors the task prompt into the worktree", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "fusion-worktree-hydrate-"));
    const rootDir = join(tempDir, "repo");
    const worktreePath = join(tempDir, "worktree");
    const sourceTaskDir = join(rootDir, ".fusion", "tasks", "FN-1");
    await mkdir(sourceTaskDir, { recursive: true });
    await mkdir(worktreePath, { recursive: true });
    await writeFile(join(sourceTaskDir, "PROMPT.md"), "# FN-1\n\n### Step 0: Preflight\n", "utf8");
    const getTask = vi.fn();
    const warn = vi.fn();

    try {
      const result = await hydrateWorktreeDb({
        rootDir,
        worktreePath,
        taskId: "FN-1",
        store: { getTask },
        logger: { warn },
      });

      expect(result).toEqual({
        tasksCopied: 0,
        documentsCopied: 1,
        artifactsCopied: 0,
        degraded: false,
        reason: "postgres_shared_store",
      });
      expect(
        await readFile(join(worktreePath, ".fusion", "tasks", "FN-1", "PROMPT.md"), "utf8"),
      ).toBe("# FN-1\n\n### Step 0: Preflight\n");
      expect(getTask).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("classifies the project root without attempting hydration", async () => {
    const result = await hydrateWorktreeDb({
      rootDir: "/repo",
      worktreePath: "/repo",
      taskId: "FN-1",
      store: { getTask: vi.fn() },
      logger: { warn: vi.fn() },
    });

    expect(result.reason).toBe("root_worktree");
    expect(result.degraded).toBe(false);
  });

  it("keeps shared storage ready when a task prompt has not been created yet", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "fusion-worktree-hydrate-"));
    const rootDir = join(tempDir, "repo");
    const worktreePath = join(tempDir, "worktree");
    await mkdir(worktreePath, { recursive: true });

    try {
      const result = await hydrateWorktreeDb({
        rootDir,
        worktreePath,
        taskId: "FN-2",
        store: { getTask: vi.fn() },
        logger: { warn: vi.fn() },
      });

      expect(result).toEqual({
        tasksCopied: 0,
        documentsCopied: 0,
        artifactsCopied: 0,
        degraded: false,
        reason: "postgres_shared_store",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
