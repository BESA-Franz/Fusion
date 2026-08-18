import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "@fusion/core";
import { classifyOwnedLandedEvidence } from "../merger.js";

const hasGit = spawnSync("git", ["--version"], { stdio: "pipe" }).status === 0;
const describeIfGit = hasGit ? describe : describe.skip;

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

describeIfGit("classifyOwnedLandedEvidence", () => {
  it("returns no-changes-finalized when branch is gone and base is reachable", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-owned-landed-classify-"));
    try {
      git(repo, "init", "-b", "main");
      git(repo, "config", "user.email", "test@example.com");
      git(repo, "config", "user.name", "Test User");
      git(repo, "commit", "--allow-empty", "-m", "init");
      const baseSha = git(repo, "rev-parse", "HEAD");

      const classification = await classifyOwnedLandedEvidence(
        repo,
        { id: "FN-TEST", branch: "fusion/fn-test", baseCommitSha: baseSha } as Task,
        { mergeTargetBranch: "main" },
      );

      expect(classification.kind).toBe("no-changes-finalized");
      if (classification.kind === "no-changes-finalized") {
        expect(classification.details).toEqual({ branchExists: false, aheadCount: null, baseReachableFromTarget: true });
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("does not return no-changes-finalized when owned commit exists", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-owned-landed-classify-"));
    try {
      git(repo, "init", "-b", "main");
      git(repo, "config", "user.email", "test@example.com");
      git(repo, "config", "user.name", "Test User");
      git(repo, "commit", "--allow-empty", "-m", "init");

      git(repo, "checkout", "-b", "fusion/fn-owned");
      writeFileSync(join(repo, "owned.txt"), "owned\n", "utf-8");
      git(repo, "add", "owned.txt");
      git(repo, "commit", "-m", "feat(FN-OWNED): landed", "-m", "Fusion-Task-Id: FN-OWNED");
      const ownedSha = git(repo, "rev-parse", "HEAD");
      git(repo, "checkout", "main");
      git(repo, "cherry-pick", ownedSha);

      const classification = await classifyOwnedLandedEvidence(
        repo,
        { id: "FN-OWNED", branch: "fusion/fn-owned" } as Task,
        { mergeTargetBranch: "main" },
      );

      expect(classification.kind).toBe("owned-commit");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "foreign trailer token",
      message: "feat: foreign trailer",
      trailer: "Fusion-Task-Id: FN-OTHER",
      taskId: "FN-TARGET",
      expectForeign: true,
    },
    {
      name: "foreign subject token",
      message: "feat(FN-OTHER): foreign subject",
      trailer: "notes",
      taskId: "FN-TARGET",
      expectForeign: true,
    },
    {
      name: "own subject and trailer tokens",
      message: "feat(FN-TARGET): own",
      trailer: "Fusion-Task-Id: FN-TARGET",
      taskId: "FN-TARGET",
      expectForeign: false,
    },
  ])("does not return no-changes-finalized when aheadCount includes $name", async ({ message, trailer, taskId, expectForeign }) => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-owned-landed-classify-"));
    try {
      git(repo, "init", "-b", "main");
      git(repo, "config", "user.email", "test@example.com");
      git(repo, "config", "user.name", "Test User");
      git(repo, "commit", "--allow-empty", "-m", "init");

      git(repo, "checkout", "-b", "fusion/fn-target");
      writeFileSync(join(repo, "foreign.txt"), "foreign\n", "utf-8");
      git(repo, "add", "foreign.txt");
      git(repo, "commit", "-m", message, "-m", trailer);
      git(repo, "checkout", "main");

      const classification = await classifyOwnedLandedEvidence(
        repo,
        { id: taskId, branch: "fusion/fn-target" } as Task,
        { mergeTargetBranch: "main" },
      );

      expect(classification.kind).toBe("unproven");
      if (classification.kind === "unproven") {
        expect(classification.reason).toBe(expectForeign ? "no-owned-commit-foreign-deltas" : "missing-evidence");
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("does not return no-changes-finalized when base is unreachable", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-owned-landed-classify-"));
    try {
      git(repo, "init", "-b", "main");
      git(repo, "config", "user.email", "test@example.com");
      git(repo, "config", "user.name", "Test User");
      git(repo, "commit", "--allow-empty", "-m", "init");

      git(repo, "checkout", "-b", "fusion/fn-a");
      writeFileSync(join(repo, "foreign.txt"), "from fn-a\n", "utf-8");
      git(repo, "add", "foreign.txt");
      git(repo, "commit", "-m", "feat(FN-A): foreign start point", "-m", "Fusion-Task-Id: FN-A");
      const foreignBaseSha = git(repo, "rev-parse", "HEAD");

      git(repo, "checkout", "main");
      const classification = await classifyOwnedLandedEvidence(
        repo,
        { id: "FN-B", branch: "fusion/fn-b", baseCommitSha: foreignBaseSha } as Task,
        { mergeTargetBranch: "main" },
      );

      expect(classification.kind).toBe("unproven");
      if (classification.kind === "unproven") {
        expect(classification.reason).toBe("foreign-start-point");
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
