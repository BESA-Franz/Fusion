import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverOverseerWatchdogFiles, formatOverseerWatchdogPromptBlocks } from "../overseer/overseer-watchdog.js";

describe("discoverOverseerWatchdogFiles", () => {
  it("returns empty when nothing is readable", () => {
    const items = discoverOverseerWatchdogFiles({
      cwd: "/tmp/project-a",
      repoRoot: "/tmp/project-a",
      readText: () => null,
    });
    expect(items).toEqual([]);
  });

  it("loads user and project files; leaf is last among project", () => {
    /**
     * FNXC:OverseerWatchdogTests 2026-08-14-21:41:
     * Discovery resolves host-native paths, so the fixture map must use the same node:path contract on Windows.
     */
    const repoRoot = resolve("repo");
    const cwd = join(repoRoot, "pkg");
    const agentDir = join(repoRoot, "user", "agent");
    const files: Record<string, string> = {
      [join(agentDir, "WATCHDOG.md")]: "user watch",
      [join(repoRoot, "OVERSEER.md")]: "root overseer",
      [join(cwd, "WATCHDOG.md")]: "pkg watch",
    };
    const items = discoverOverseerWatchdogFiles({
      cwd,
      repoRoot,
      agentDir,
      readText: (p) => files[p] ?? null,
    });
    expect(items.map((i) => i.content)).toEqual(["user watch", "root overseer", "pkg watch"]);
    expect(items[0].level).toBe("user");
    expect(items[items.length - 1].content).toBe("pkg watch");
  });

  it("never throws on reader errors", () => {
    const items = discoverOverseerWatchdogFiles({
      cwd: "/x",
      repoRoot: "/x",
      readText: () => {
        throw new Error("boom");
      },
    });
    expect(items).toEqual([]);
  });
});

describe("formatOverseerWatchdogPromptBlocks", () => {
  it("wraps content in attention blocks", () => {
    const blocks = formatOverseerWatchdogPromptBlocks([
      { path: "/r/OVERSEER.md", content: "Watch merge trait", level: "project", depth: 0 },
    ]);
    expect(blocks[0]).toContain("<attention");
    expect(blocks[0]).toContain("Watch merge trait");
  });
});
