import { describe, expect, it } from "vitest";
import { resolveDesktopProcessNodeId, resolveDesktopRuntimePrimaryProject } from "../engine-runtime";

describe("resolveDesktopProcessNodeId", () => {
  const central = {
    listNodes: async () => [
      { id: "node-local", type: "local" },
      { id: "node-pc2", type: "remote" },
    ],
  } as unknown as import("@fusion/core").CentralCore;

  it("keeps default desktop startup on the registry-local node without FUSION_NODE_ID", async () => {
    await expect(resolveDesktopProcessNodeId(central, undefined)).resolves.toBe("node-local");
  });

  it("honors an explicit desktop process node", async () => {
    await expect(resolveDesktopProcessNodeId(central, "node-pc2")).resolves.toBe("node-pc2");
  });
});

/*
 * The desktop embedded runtime must NEVER auto-register a project (e.g. the home directory).
 * resolveDesktopRuntimePrimaryProject only picks an already-registered project as the primary
 * engine target, and registers nothing.
 */
describe("resolveDesktopRuntimePrimaryProject", () => {
  it("returns null when no projects are registered (never auto-registers)", async () => {
    let registerCalled = false;
    const central = {
      listProjects: async () => [],
      registerProject: async () => {
        registerCalled = true;
        throw new Error("resolveDesktopRuntimePrimaryProject must not register a project");
      },
    } as unknown as import("@fusion/core").CentralCore;

    const result = await resolveDesktopRuntimePrimaryProject(central);
    expect(result).toBeNull();
    expect(registerCalled).toBe(false);
  });

  it("returns the first existing project as primary without registering", async () => {
    const projects = [{ id: "proj_1" }, { id: "proj_2" }];
    let registerCalled = false;
    const central = {
      listProjects: async () => projects,
      registerProject: async () => {
        registerCalled = true;
        return projects[0];
      },
    } as unknown as import("@fusion/core").CentralCore;

    const result = await resolveDesktopRuntimePrimaryProject(central);
    expect(result?.id).toBe("proj_1");
    expect(registerCalled).toBe(false);
  });
});
