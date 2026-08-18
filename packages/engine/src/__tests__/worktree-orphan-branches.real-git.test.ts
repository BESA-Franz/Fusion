import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanOrphanedBranches } from "../worktree/worktree-pool.js";

const hasGit = spawnSync("git", ["--version"], { stdio: "pipe" }).status === 0;
const describeIfGit = hasGit ? describe : describe.skip;

function git(repo: string, command: string): string {
  return execSync(command, { cwd: repo, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

describeIfGit("scanOrphanedBranches (real git)", () => {
  const repos: string[] = [];

  afterEach(() => {
    for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
  });

  it("lists only local fusion branches through the native shell", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-orphan-branches-"));
    repos.push(repo);
    git(repo, "git init -b main");
    git(repo, "git config user.email test@example.com");
    git(repo, "git config user.name Test");
    writeFileSync(join(repo, "base.txt"), "base\n", "utf-8");
    git(repo, "git add base.txt && git commit -m init");
    git(repo, "git branch fusion/fn-orphan");
    git(repo, "git branch feature/not-fusion");

    const branches = await scanOrphanedBranches(
      repo,
      { listTasks: async () => [] } as any,
    );

    expect(branches).toEqual(["fusion/fn-orphan"]);
  });
});
