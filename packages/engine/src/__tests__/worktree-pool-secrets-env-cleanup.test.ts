import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const cleanupSecretsEnvFile = vi.fn();

vi.mock("../worktree/secrets-env-writer.js", () => ({
  cleanupSecretsEnvFile,
}));

const dirs: string[] = [];
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pool-cleanup-"));
  dirs.push(root);
  return root;
}

afterEach(async () => {
  cleanupSecretsEnvFile.mockReset();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("worktree-pool secrets cleanup hooks", () => {
  it("reapOrphanWorktrees invokes cleanup before removal", async () => {
    cleanupSecretsEnvFile.mockImplementation(async ({ worktreePath }: { worktreePath: string }) => {
      rmSync(join(worktreePath, ".env"), { force: true });
      return { outcome: "cleaned", reason: "fingerprint-match" };
    });
    const root = tmpRoot();
    const worktrees = join(root, ".worktrees");
    const orphan = join(worktrees, "orphan-1");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, ".env"), "A=1\n");

    const mod = await import("../worktree/worktree-pool.js");
    const removed = await mod.reapOrphanWorktrees(root);

    expect(removed).toBe(1);
    expect(cleanupSecretsEnvFile).toHaveBeenCalledWith(expect.objectContaining({
      worktreePath: orphan,
      taskId: "orphan:orphan-1",
    }));
    expect(existsSync(orphan)).toBe(false);
  });

  it("cleanup failures preserve the orphan directory", async () => {
    cleanupSecretsEnvFile.mockRejectedValueOnce(new Error("cleanup failed"));
    const root = tmpRoot();
    const orphan = join(root, ".worktrees", "orphan-2");
    mkdirSync(orphan, { recursive: true });

    const mod = await import("../worktree/worktree-pool.js");
    const removed = await mod.reapOrphanWorktrees(root);

    expect(removed).toBe(0);
    expect(existsSync(orphan)).toBe(true);
  });
});
