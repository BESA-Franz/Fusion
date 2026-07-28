import { describe, expect, it } from "vitest";
import { canDispatchEffectiveNode, resolveEffectiveNode } from "../effective-node.js";

describe("resolveEffectiveNode", () => {
  it.each([
    {
      name: "uses task override when both task and project default are set",
      taskNodeId: "node-task",
      projectDefaultNodeId: "node-project",
      expected: { nodeId: "node-task", source: "task-override" as const },
    },
    {
      name: "uses project default when task override is not set",
      taskNodeId: undefined,
      projectDefaultNodeId: "node-project",
      expected: { nodeId: "node-project", source: "project-default" as const },
    },
    {
      name: "uses local when neither task override nor project default is set",
      taskNodeId: undefined,
      projectDefaultNodeId: undefined,
      expected: { nodeId: undefined, source: "local" as const },
    },
    {
      name: "treats empty task override as unset and falls through to project default",
      taskNodeId: "",
      projectDefaultNodeId: "node-project",
      expected: { nodeId: "node-project", source: "project-default" as const },
    },
    {
      name: "treats empty project default as unset and falls through to local",
      taskNodeId: undefined,
      projectDefaultNodeId: "",
      expected: { nodeId: undefined, source: "local" as const },
    },
    {
      name: "uses local when both task and project values are empty",
      taskNodeId: "",
      projectDefaultNodeId: "",
      expected: { nodeId: undefined, source: "local" as const },
    },
  ])("$name", ({ taskNodeId, projectDefaultNodeId, expected }) => {
    expect(resolveEffectiveNode({ nodeId: taskNodeId }, { defaultNodeId: projectDefaultNodeId })).toEqual(expected);
  });

  it("treats null task nodeId as unset", () => {
    expect(resolveEffectiveNode({ nodeId: null as unknown as string }, { defaultNodeId: "node-project" })).toEqual({
      nodeId: "node-project",
      source: "project-default",
    });
  });

  it("treats null project default as unset", () => {
    expect(resolveEffectiveNode({ nodeId: undefined }, { defaultNodeId: null as unknown as string })).toEqual({
      nodeId: undefined,
      source: "local",
    });
  });

  it("uses task override when set even if project default is empty", () => {
    expect(resolveEffectiveNode({ nodeId: "node-task" }, { defaultNodeId: "" })).toEqual({
      nodeId: "node-task",
      source: "task-override",
    });
  });

  it("uses the persisted effective node when no task override is set", () => {
    expect(resolveEffectiveNode(
      { nodeId: undefined, effectiveNodeId: "node-effective", effectiveNodeSource: "project-default" },
      { defaultNodeId: "node-current-default" },
    )).toEqual({
      nodeId: "node-effective",
      source: "project-default",
    });
  });

  it("prefers an explicit task override over the persisted effective node", () => {
    expect(resolveEffectiveNode(
      { nodeId: "node-task", effectiveNodeId: "node-effective", effectiveNodeSource: "project-default" },
      { defaultNodeId: "node-project" },
    )).toEqual({
      nodeId: "node-task",
      source: "task-override",
    });
  });

  it("allows an unassigned local route", () => {
    expect(canDispatchEffectiveNode({ nodeId: undefined, source: "local" }, "node-local")).toBe(true);
  });

  it("allows a route assigned to the local node", () => {
    expect(canDispatchEffectiveNode({ nodeId: "node-local", source: "task-override" }, "node-local")).toBe(true);
  });

  it("rejects a route assigned to a foreign node", () => {
    expect(canDispatchEffectiveNode({ nodeId: "node-foreign", source: "task-override" }, "node-local")).toBe(false);
  });
});
