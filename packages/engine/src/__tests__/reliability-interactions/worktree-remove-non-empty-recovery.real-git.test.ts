import { access, chmod, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NativeWorktreeBackend, RemovalReason, removeWorktree } from "../../worktree/worktree-backend.js";
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
  let originalPath: string | undefined;

  afterEach(async () => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
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

  async function installGitRemoveFailureShim(
    stderr = "error: failed to delete '$4': Directory not empty",
  ): Promise<void> {
    const realGit = git(process.cwd(), process.platform === "win32" ? "where git" : "command -v git")
      .split(/\r?\n/, 1)[0];
    const shimDir = await mkdtemp(join(tmpdir(), "fusion-fake-git-"));
    roots.push(shimDir);
    const shimScriptPath = join(shimDir, "git-shim.cjs");
    await writeFile(
      shimScriptPath,
      `const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "worktree" && args[1] === "remove" && args[2] === "--force") {
  process.stderr.write(${JSON.stringify(`${stderr}\n`)});
  process.exit(1);
}
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
if (result.error) process.stderr.write(String(result.error.message) + "\\n");
process.exit(result.status ?? 1);
`,
      "utf-8",
    );
    const shimPath = join(shimDir, process.platform === "win32" ? "git.cmd" : "git");
    await writeFile(
      shimPath,
      process.platform === "win32"
        ? `@echo off\r\n${JSON.stringify(process.execPath)} "%~dp0git-shim.cjs" %*\r\n`
        : `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "\${0%/*}/git-shim.cjs" "$@"\n`,
      "utf-8",
    );
    await chmod(shimPath, 0o755);
    originalPath = process.env.PATH;
    const shellDir = process.platform === "win32"
      ? dirname(process.env.ComSpec ?? process.env.COMSPEC ?? "C:\\Windows\\System32\\cmd.exe")
      : undefined;
    process.env.PATH = shellDir ? `${shimDir}${delimiter}${shellDir}` : shimDir;
  }

  async function expectWorktreeRemoved(root: string, worktreePath: string): Promise<void> {
    expect(await pathExists(worktreePath)).toBe(false);
    const porcelain = git(root, "git worktree list --porcelain").replaceAll("\\", "/");
    expect(porcelain).not.toContain(`worktree ${worktreePath.replaceAll("\\", "/")}`);
  }

  it("removes and prunes a worktree with untracked-only content when git remove reports Directory not empty", async () => {
    const root = await setupRepo();
    const worktreePath = await createWorktree(root, "fn-untracked", "fusion/fn-untracked");
    const resolvedWorktreePath = await realpath(worktreePath);
    await mkdir(join(worktreePath, "dist"), { recursive: true });
    await writeFile(join(worktreePath, "dist", "artifact.txt"), "artifact\n", "utf-8");
    await installGitRemoveFailureShim();
    const events: string[] = [];

    await removeWorktree({
      rootDir: root,
      worktreePath,
      settings: {},
      reason: RemovalReason.ExecutorDispose,
      force: true,
      audit: { git: async (event) => void events.push(event.type) },
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
    await installGitRemoveFailureShim();

    await new NativeWorktreeBackend().remove({ rootDir: root, worktreePath });

    await expectWorktreeRemoved(root, resolvedWorktreePath);
  });

  it("preserves native already-missing validation-failed behavior", async () => {
    const root = await setupRepo();
    const worktreePath = await createWorktree(root, "fn-missing", "fusion/fn-missing");
    await rm(worktreePath, { recursive: true, force: true });
    await installGitRemoveFailureShim("fatal: validation failed, cannot remove working tree");

    await expect(new NativeWorktreeBackend().remove({ rootDir: root, worktreePath })).rejects.toThrow(/validation failed/i);
  });

  it("still rethrows non-recoverable native removal failures", async () => {
    const root = await setupRepo();
    const notAWorktreePath = join(root, "not-a-worktree");
    await mkdir(notAWorktreePath);

    await expect(new NativeWorktreeBackend().remove({ rootDir: root, worktreePath: notAWorktreePath })).rejects.toThrow();
    expect(await pathExists(notAWorktreePath)).toBe(true);
  });
});
