import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  summarizeCommitSubject: vi.fn(async () => "describe landed change"),
}));

vi.mock("@fusion/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fusion/core")>()),
  resolveTitleSummarizerSettingsModel: () => ({ provider: "mock", modelId: "mock-model" }),
  summarizeCommitSubject: coreMocks.summarizeCommitSubject,
}));

import { regenerateBareMergeSubject } from "../merge/merger-bare-subject.js";

describe("bare merge subject regeneration with real Git", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
    coreMocks.summarizeCommitSubject.mockClear();
  });

  it("reads the landed diff stat through the native Windows shell", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-bare-subject-"));
    fixtures.push(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();

    git("init", "-q", "-b", "main");
    git("config", "core.autocrlf", "false");
    git("config", "user.email", "fusion-test@example.invalid");
    git("config", "user.name", "Fusion Test");
    writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n", "utf-8");
    git("add", "feature.ts");
    git("commit", "-qm", "feat(FN-5002): merge fusion/fn-5002");
    const commitSha = git("rev-parse", "HEAD");

    await expect(regenerateBareMergeSubject({
      subject: "feat(FN-5002): merge fusion/fn-5002",
      commitSha,
      branch: "fusion/fn-5002",
      taskId: "FN-5002",
      rootDir: repo,
      settings: { useAiMergeCommitSummary: true } as any,
    })).resolves.toBe("feat(FN-5002): describe landed change");
    expect(coreMocks.summarizeCommitSubject).toHaveBeenCalledOnce();
    expect(String(coreMocks.summarizeCommitSubject.mock.calls[0]?.[0])).toContain("feature.ts");
  });
});
