import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateScopeAutoWiden } from "../merge/merger-scope-auto-widen.js";

describe("scope auto-widen with real Git", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
  });

  it("attributes a Windows path with spaces to the task branch", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-scope-widen-"));
    fixtures.push(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();
    const file = "src/scope evidence.ts";

    git("init", "-q", "-b", "main");
    git("config", "core.autocrlf", "false");
    git("config", "user.email", "fusion-test@example.invalid");
    git("config", "user.name", "Fusion Test");
    writeFileSync(join(repo, "README.md"), "base\n", "utf-8");
    git("add", "README.md");
    git("commit", "-qm", "base");
    const baseRef = git("rev-parse", "HEAD");
    git("checkout", "-qb", "fusion/fn-5000");
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), "export const evidence = true;\n", "utf-8");
    git("add", "--", file);
    git("commit", "-qm", "feat(FN-5000): add scoped evidence");
    const commitSha = git("rev-parse", "HEAD");
    const store = {
      parseFileScopeFromPrompt: vi.fn(async () => []),
      listTasks: vi.fn(async () => []),
    } as any;

    const result = await evaluateScopeAutoWiden({
      store,
      task: { id: "FN-5000" } as any,
      taskId: "FN-5000",
      rootDir: repo,
      branch: "fusion/fn-5000",
      baseRef,
      candidateFiles: [file],
    });

    expect(result).toEqual({
      widened: [{ file, attribution: "subject-prefix", commits: [commitSha] }],
      refused: [],
    });
  });
});
