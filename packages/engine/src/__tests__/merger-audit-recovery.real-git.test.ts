import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkContributionSurvival } from "../merge/merger-audit-recovery.js";

describe("merger audit recovery with real Git", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
  });

  it("reads commit:file evidence through the native Windows shell", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-audit-survival-"));
    fixtures.push(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();
    const file = "audit evidence.txt";

    git("init", "-q", "-b", "main");
    git("config", "core.autocrlf", "false");
    git("config", "user.email", "fusion-test@example.invalid");
    git("config", "user.name", "Fusion Test");
    writeFileSync(join(repo, file), "base\n", "utf-8");
    git("add", "--", file);
    git("commit", "-qm", "base");
    writeFileSync(join(repo, file), "base\nlanded contribution\n", "utf-8");
    git("add", "--", file);
    git("commit", "-qm", "land contribution");
    const landedSha = git("rev-parse", "HEAD");
    writeFileSync(join(repo, file), "base\nlanded contribution\ntask contribution\n", "utf-8");
    git("add", "--", file);
    git("commit", "-qm", "task head");
    const headSha = git("rev-parse", "HEAD");
    const mergerLog = { warn: vi.fn(), log: vi.fn(), error: vi.fn() } as any;

    const report = await checkContributionSurvival({
      rootDir: repo,
      finding: {
        type: "touched-file-overlap",
        file,
        recentMainCommits: [{ sha: landedSha, subject: "land contribution" }],
      },
      headSha,
      mergerLog,
    });

    expect(report).toMatchObject({
      allSurvived: true,
      perCommit: [{ file, mainCommitSha: landedSha, addedLineCount: 1, missingLineCount: 0, survived: true }],
    });
    expect(mergerLog.warn).not.toHaveBeenCalled();
  });
});
