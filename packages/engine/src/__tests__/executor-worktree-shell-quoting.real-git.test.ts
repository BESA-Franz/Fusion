import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { squashImportDepIntoWorktree } from "../executor/worktree-create-outer.js";
import { planSquashImportFromDep } from "../executor/worktree-squash-import-plan.js";

const hasGit = spawnSync("git", ["--version"], { stdio: "pipe" }).status === 0;
const describeIfGit = hasGit ? describe : describe.skip;

function git(repo: string, command: string): string {
  return execSync(command, { cwd: repo, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

describeIfGit("executor worktree shell quoting (real git)", () => {
  const repos: string[] = [];

  afterEach(() => {
    for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
  });

  it("squash-imports a dependency branch and attributes the import commit", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-executor-quote-"));
    repos.push(repo);
    git(repo, "git init -b main");
    git(repo, "git config user.email test@example.com");
    git(repo, "git config user.name Test");
    writeFileSync(join(repo, "base.txt"), "base\n", "utf-8");
    git(repo, "git add base.txt && git commit -m init");

    git(repo, "git checkout -b fusion/dependency");
    writeFileSync(join(repo, "dependency.txt"), "dependency\n", "utf-8");
    git(repo, "git add dependency.txt && git commit -m dependency");
    git(repo, "git checkout main");

    const store = { logEntry: vi.fn(async () => undefined) };
    await squashImportDepIntoWorktree(store, repo, "FN-QUOTE-1", "fusion/dependency", "dependency");

    expect(git(repo, "git show HEAD:dependency.txt")).toBe("dependency");
    expect(git(repo, "git log -1 --format=%s")).toBe("chore(FN-QUOTE-1): import dependency content from dependency");
    expect(store.logEntry).toHaveBeenCalledOnce();
    expect(git(repo, "git status --porcelain")).toBe("");
  });

  it("plans a squash import from Windows-compatible commit arguments", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-executor-plan-quote-"));
    repos.push(repo);
    git(repo, "git init -b main");
    git(repo, "git config user.email test@example.com");
    git(repo, "git config user.name Test");
    writeFileSync(join(repo, "base.txt"), "base\n", "utf-8");
    git(repo, "git add base.txt && git commit -m init");
    const mainBase = git(repo, "git rev-parse HEAD");

    git(repo, "git checkout -b fusion/dependency");
    writeFileSync(join(repo, "dependency.txt"), "dependency\n", "utf-8");
    git(repo, "git add dependency.txt && git commit -m dependency");
    const depTip = git(repo, "git rev-parse HEAD");
    git(repo, "git checkout main");

    const plan = await planSquashImportFromDep(
      repo,
      { getSettings: async () => ({ worktreeRebaseBeforeMerge: false }) },
      "FN-QUOTE-2",
      depTip,
      "fusion/dependency",
    );

    expect(plan).toEqual({ depTip, mainBase, label: "fusion/dependency" });
  });
});
