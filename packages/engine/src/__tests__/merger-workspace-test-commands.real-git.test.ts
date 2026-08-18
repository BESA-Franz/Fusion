import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deriveFileScopedPnpmTestCommand } from "../merge/merger-workspace-test-commands.js";

const quoteArg = (value: string) => process.platform === "win32"
  ? JSON.stringify(value)
  : `'${value.replace(/'/g, "'\\''")}'`;

describe("workspace test command derivation with real Git", () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
  });

  it("derives a runnable native-shell command for a changed test path with spaces", () => {
    const repo = mkdtempSync(join(tmpdir(), "fusion-workspace-tests-"));
    fixtures.push(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf-8" }).trim();
    const packageRoot = join(repo, "packages", "engine");
    const testRelPath = "src/__tests__/scope path.test.ts";

    git("init", "-q", "-b", "main");
    git("config", "core.autocrlf", "false");
    git("config", "user.email", "fusion-test@example.invalid");
    git("config", "user.name", "Fusion Test");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(repo, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf-8");
    writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf-8");
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@fusion/engine" }), "utf-8");
    git("add", ".");
    git("commit", "-qm", "workspace base");
    git("checkout", "-qb", "fusion/fn-5001");
    mkdirSync(join(packageRoot, "src", "__tests__"), { recursive: true });
    writeFileSync(join(packageRoot, testRelPath), "export {};\n", "utf-8");
    git("add", ".");
    git("commit", "-qm", "test(FN-5001): add scoped test");

    expect(deriveFileScopedPnpmTestCommand(repo, "main", "fusion/fn-5001")).toBe(
      `pnpm --filter ${quoteArg("@fusion/engine")} exec vitest run ${quoteArg(testRelPath)} --silent=passed-only --reporter=dot`,
    );
  });
});
