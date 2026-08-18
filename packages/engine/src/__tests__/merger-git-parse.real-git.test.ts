import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { quoteArg } from "../merge/merger-git-parse.js";

describe("merger Git argument quoting with real Git", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
  });

  it("preserves dollar signs and backticks through the native shell", () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-git-quote-"));
    fixtures.push(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();
    const file = "scope $value `tick.ts";

    git("init", "-q", "-b", "main");
    git("config", "core.autocrlf", "false");
    git("config", "user.email", "fusion-test@example.invalid");
    git("config", "user.name", "Fusion Test");
    writeFileSync(join(repo, file), "export const value = 1;\n", "utf-8");
    git("add", ".");
    git("commit", "-qm", "fixture base");
    writeFileSync(join(repo, file), "export const value = 2;\n", "utf-8");

    const changed = execSync(`git diff --name-only HEAD -- ${quoteArg(file)}`, {
      cwd: repo,
      encoding: "utf-8",
    }).trim();

    expect(changed).toBe(file);
  });
});
