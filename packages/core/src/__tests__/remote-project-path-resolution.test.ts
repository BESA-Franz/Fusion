import { describe, expect, it, vi } from "vitest";
import { BackwardCompat } from "../central/migration.js";
import type { CentralCore } from "../central/central-core.js";

describe("BackwardCompat remote project paths", () => {
  it("uses the process node mapping for a shared project", async () => {
    const central = {
      getProject: vi.fn().mockResolvedValue({ id: "proj-1", path: "/workspace" }),
      resolveProjectWorkingDirectory: vi.fn().mockResolvedValue("C:\\BESA\\worktrees\\pc3"),
    } as unknown as CentralCore;

    const context = await new BackwardCompat(central).resolveProjectContext(
      "/workspace",
      "proj-1",
      "node-pc3",
    );

    expect(central.resolveProjectWorkingDirectory).toHaveBeenCalledWith("proj-1", "node-pc3");
    expect(context.workingDirectory).toBe("C:\\BESA\\worktrees\\pc3");
  });

  it("keeps legacy project-path resolution when no process node is configured", async () => {
    const central = {
      getProject: vi.fn().mockResolvedValue({ id: "proj-1", path: "/workspace" }),
      resolveProjectWorkingDirectory: vi.fn(),
    } as unknown as CentralCore;

    const context = await new BackwardCompat(central).resolveProjectContext("/workspace", "proj-1");

    expect(central.resolveProjectWorkingDirectory).not.toHaveBeenCalled();
    expect(context.workingDirectory).toBe("/workspace");
  });
});
