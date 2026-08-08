import { afterEach, describe, expect, it } from "vitest";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureWorktreeProjectStateLinks } from "../worktree/worktree-project-state-links.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("ensureWorktreeProjectStateLinks", () => {
  it("exposes shared memory without copying the control plane", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "fusion-link-root-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "fusion-link-worktree-"));
    cleanup.push(rootDir, worktreePath);
    mkdirSync(join(rootDir, ".fusion", "memory"), { recursive: true });
    mkdirSync(join(rootDir, ".fusion", "agent-memory"), { recursive: true });
    writeFileSync(join(rootDir, ".fusion", "memory", "MEMORY.md"), "# shared\n", "utf8");

    await ensureWorktreeProjectStateLinks({ rootDir, worktreePath, taskId: "FN-LINK" });

    expect(lstatSync(join(worktreePath, ".fusion", "memory")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(worktreePath, ".fusion", "agent-memory")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(worktreePath, ".fusion", "memory", "MEMORY.md"), "utf8")).toBe("# shared\n");
    expect(existsSync(join(worktreePath, ".fusion", "tasks"))).toBe(false);
  });

  it("does not replace an existing worktree-local memory directory", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "fusion-link-root-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "fusion-link-worktree-"));
    cleanup.push(rootDir, worktreePath);
    mkdirSync(join(rootDir, ".fusion", "memory"), { recursive: true });
    mkdirSync(join(worktreePath, ".fusion", "memory"), { recursive: true });
    writeFileSync(join(worktreePath, ".fusion", "memory", "MEMORY.md"), "# local\n", "utf8");

    await ensureWorktreeProjectStateLinks({ rootDir, worktreePath });

    expect(lstatSync(join(worktreePath, ".fusion", "memory")).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(worktreePath, ".fusion", "memory", "MEMORY.md"), "utf8")).toBe("# local\n");
  });
});
