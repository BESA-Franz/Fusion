import { describe, expect, it } from "vitest";
import { resolveDesktopNodeIdentity, resolveDesktopProcessNodeId, resolveDesktopRuntimePrimaryProject } from "../engine-runtime";

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

  it("rejects an explicit remote process node instead of splitting Desktop identity", async () => {
    await expect(resolveDesktopProcessNodeId(central, "node-pc2")).rejects.toThrow(
      "Desktop runtime node must be registry-local: node-pc2",
    );
  });

  it("returns process and registry-local identities from the same node snapshot", async () => {
    await expect(resolveDesktopNodeIdentity(central, "node-local")).resolves.toEqual({
      processNodeId: "node-local",
      registryLocalNodeId: "node-local",
    });
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
