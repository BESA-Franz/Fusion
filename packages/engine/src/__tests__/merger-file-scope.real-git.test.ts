import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCommitRangeFilesReader } from "../merge/merger-file-scope.js";

describe("commit-range file scope reader with real Git", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
  });

  it("preserves shell-significant refs and spaced paths", async () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-file-scope-"));
    fixtures.push(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();
    const baseRef = "base&scope";
    const headRef = "head&scope";
    const file = "src scope.ts";

    git("init", "-q", "-b", "main");
    git("config", "core.autocrlf", "false");
    git("config", "user.email", "fusion-test@example.invalid");
    git("config", "user.name", "Fusion Test");
    writeFileSync(join(repo, "README.md"), "base\n", "utf-8");
    git("add", "README.md");
    git("commit", "-qm", "base");
    git("branch", baseRef);
    writeFileSync(join(repo, file), "export const scope = true;\n", "utf-8");
    git("add", "--", file);
    git("commit", "-qm", "add scope file");
    git("branch", headRef);

    await expect(createCommitRangeFilesReader(baseRef, headRef)(repo)).resolves.toEqual([file]);
  });
});
