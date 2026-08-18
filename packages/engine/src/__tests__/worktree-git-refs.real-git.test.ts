import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveContaminationBaseRef, resolveDiffBaseRef } from "../executor/worktree-git-refs.js";
import { resolveResumeContaminationBase } from "../worktree/worktree-acquisition.js";
import { BranchWorktreeAutoRecoveryHandler } from "../auto-recovery-handlers/branch-worktree.js";

describe("worktree Git-ref fallback with real Git", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("resolves origin/main when a Windows checkout has no local main branch", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-worktree-git-refs-"));
    fixtures.push(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();

    git("init", "-q", "-b", "feature/fn-refs");
    git("config", "user.email", "fusion-test@example.invalid");
    git("config", "user.name", "Fusion Test");
    git("commit", "--allow-empty", "-qm", "fixture base");
    const expectedSha = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", expectedSha);

    await expect(resolveContaminationBaseRef(repo)).resolves.toBe(expectedSha);
    await expect(resolveDiffBaseRef(repo)).resolves.toBe(expectedSha);
    await expect(resolveResumeContaminationBase(repo)).resolves.toBe(expectedSha);

    const handler = new BranchWorktreeAutoRecoveryHandler({
      taskStore: {} as never,
      runAudit: {} as never,
    });
    await expect((handler as any).hasBranchRef(repo, "feature/fn-refs")).resolves.toBe(true);
    await expect((handler as any).getTipSha(repo, "feature/fn-refs")).resolves.toBe(expectedSha);
  });
});
