import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listFusionBranchRefs } from "../self-healing-git-evidence.js";

const hasGit = spawnSync("git", ["--version"], { stdio: "pipe" }).status === 0;
const describeIfGit = hasGit ? describe : describe.skip;

function git(repo: string, command: string): string {
  return execSync(command, { cwd: repo, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

describeIfGit("self-healing fusion branch inventory (real git)", () => {
  const repos: string[] = [];

  afterEach(() => {
    for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
  });

  it("returns exact unquoted fusion ref names through the native shell", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-self-heal-refs-"));
    repos.push(repo);
    git(repo, "git init -b main");
    git(repo, "git config user.email test@example.com");
    git(repo, "git config user.name Test");
    writeFileSync(join(repo, "base.txt"), "base\n", "utf-8");
    git(repo, "git add base.txt && git commit -m init");
    git(repo, "git branch fusion/Fn-Case");
    git(repo, "git branch feature/not-fusion");

    await expect(listFusionBranchRefs(repo)).resolves.toEqual(["fusion/Fn-Case"]);
  });
});
