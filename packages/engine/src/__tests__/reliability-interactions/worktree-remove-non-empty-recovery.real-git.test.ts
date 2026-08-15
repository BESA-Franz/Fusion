import { access, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NativeWorktreeBackend, RemovalReason, removeWorktree, type NativeGitExec } from "../../worktree/worktree-backend.js";
import { git, hasGit } from "./_helpers.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasGit)("reliability interactions: worktree remove non-empty recovery", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots.length = 0;
  });

  async function setupRepo(prefix = "fusion-remove-non-empty-") {
    const root = await mkdtemp(join(tmpdir(), prefix));
    roots.push(root);
    git(root, "git init -b main");
    git(root, 'git config user.email "test@example.com"');
    git(root, 'git config user.name "Test User"');
    await writeFile(join(root, "README.md"), "# repo\n", "utf-8");
    git(root, "git add README.md");
    git(root, 'git commit -m "init"');
    return root;
  }

  async function createWorktree(root: string, name: string, branch: string): Promise<string> {
    const worktreePath = join(root, ".worktrees", name);
    git(root, `git worktree add -b ${JSON.stringify(branch)} ${JSON.stringify(worktreePath)}`);
    return worktreePath;
  }

  function failingGitExec(stderr: string): NativeGitExec {
    return async () => {
      const error = new Error(stderr) as Error & { stderr: string };
      error.stderr = stderr;
      throw error;
    };
  }

  async function expectWorktreeRemoved(root: string, worktreePath: string): Promise<void> {
    expect(await pathExists(worktreePath)).toBe(false);
    const porcelain = git(root, "git worktree list --porcelain");
    expect(porcelain).not.toContain(`worktree ${worktreePath}`);
    expect(porcelain).not.toContain(`worktree ${await realpath(dirname(worktreePath)).catch(() => dirname(worktreePath))}/${worktreePath.split("/").pop()}`);
  }

  it("removes and prunes a worktree with untracked-only content when git remove reports Directory not empty", async () => {
    const root = await setupRepo();
    const worktreePath = await createWorktree(root, "fn-untracked", "fusion/fn-untracked");
    const resolvedWorktreePath = await realpath(worktreePath);
    await mkdir(join(worktreePath, "dist"), { recursive: true });
    await writeFile(join(worktreePath, "dist", "artifact.txt"), "artifact\n", "utf-8");
    const failingExec = failingGitExec("error: failed to delete: Directory not empty");
    const events: string[] = [];

    await removeWorktree({
      rootDir: root,
      worktreePath,
      settings: {},
      reason: RemovalReason.ExecutorDispose,
      force: true,
      audit: { git: async (event) => void events.push(event.type) },
      exec: failingExec,
    });

    await expectWorktreeRemoved(root, resolvedWorktreePath);
    expect(events).toContain("worktree:remove-fallback");
    expect(events).toContain("worktree:admin-entry-pruned");
    expect(events).toContain("worktree:remove");
  });

  it("removes and prunes a worktree with nested-git content when native removal falls back", async () => {
    const root = await setupRepo();
    const worktreePath = await createWorktree(root, "fn-nested", "fusion/fn-nested");
    const resolvedWorktreePath = await realpath(worktreePath);
    const nestedRepo = join(worktreePath, "node_modules", "inner-repo");
    await mkdir(nestedRepo, { recursive: true });
    git(nestedRepo, "git init -b main");
    await writeFile(join(nestedRepo, "package.json"), "{}\n", "utf-8");
    const failingExec = failingGitExec("error: failed to delete: Directory not empty");

    await new NativeWorktreeBackend({ exec: failingExec }).remove({ rootDir: root, worktreePath });

    await expectWorktreeRemoved(root, resolvedWorktreePath);
  });

  it("preserves native already-missing validation-failed behavior", async () => {
    const root = await setupRepo();
    const worktreePath = await createWorktree(root, "fn-missing", "fusion/fn-missing");
    await rm(worktreePath, { recursive: true, force: true });
    const failingExec = failingGitExec("fatal: validation failed, cannot remove working tree");

    await expect(new NativeWorktreeBackend({ exec: failingExec }).remove({ rootDir: root, worktreePath })).rejects.toThrow(/validation failed/i);
  });

  it("still rethrows non-recoverable native removal failures", async () => {
    const root = await setupRepo();
    const notAWorktreePath = join(root, "not-a-worktree");
    await mkdir(notAWorktreePath);

    await expect(new NativeWorktreeBackend().remove({ rootDir: root, worktreePath: notAWorktreePath })).rejects.toThrow();
    expect(await pathExists(notAWorktreePath)).toBe(true);
  });
});
