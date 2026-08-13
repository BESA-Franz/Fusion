import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { shellQuote } from "../git-shell-quote.js";
import { quoteShellArg } from "../executor/shell-quote.js";
import { SelfHealingGitEvidence } from "../self-healing-git-evidence.js";

const temporaryRepositories: string[] = [];

function git(repoDir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" }).trim();
}

describe("git shell argument quoting", () => {
  afterEach(() => {
    for (const repoDir of temporaryRepositories.splice(0)) {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("preserves POSIX single-quote escaping", () => {
    expect(shellQuote("worker's branch", "linux")).toBe("'worker'\\''s branch'");
  });

  it("uses command-line quoting accepted by Windows Git", () => {
    expect(shellQuote("HEAD", "win32")).toBe('"HEAD"');
    expect(shellQuote('a"b', "win32")).toBe('"a\\"b"');
    expect(quoteShellArg("origin", "win32")).toBe('"origin"');
    expect(quoteShellArg("worker's branch", "linux")).toBe("'worker'\\''s branch'");
  });

  it("finds a lineage trailer through the host shell and recovery reader", async () => {
    const repoDir = mkdtempSync(join(tmpdir(), "fusion git-shell-"));
    temporaryRepositories.push(repoDir);
    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "fusion-test@example.invalid"]);
    git(repoDir, ["config", "user.name", "Fusion Test"]);
    writeFileSync(join(repoDir, "evidence.txt"), "runtime evidence\n", "utf8");
    git(repoDir, ["add", "evidence.txt"]);
    git(repoDir, [
      "commit",
      "-m",
      "fix(FN-WINDOWS): preserve recovery evidence",
      "-m",
      "Fusion-Task-Lineage: lineage-windows-1",
    ]);

    const lineagePattern = "^Fusion-Task-Lineage: lineage-windows-1$";
    const command = [
      "git log",
      "--format=%H",
      "--max-count=1",
      "-E",
      `--grep=${shellQuote(lineagePattern)}`,
      shellQuote("HEAD"),
    ].join(" ");

    const sha = execSync(command, { cwd: repoDir, encoding: "utf8" }).trim();
    expect(sha).toBe(git(repoDir, ["rev-parse", "HEAD"]));

    const evidence = Object.create(SelfHealingGitEvidence.prototype) as {
      options: { rootDir: string };
      findLandedTaskCommit: (task: {
        id: string;
        lineageId: string;
      }) => Promise<{ sha: string } | null>;
    };
    evidence.options = { rootDir: repoDir };
    const landed = await evidence.findLandedTaskCommit({
      id: "FN-WINDOWS",
      lineageId: "lineage-windows-1",
    });
    expect(landed?.sha).toBe(sha);
  });
});
