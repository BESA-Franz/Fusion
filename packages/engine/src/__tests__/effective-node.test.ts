import { describe, expect, it } from "vitest";
import {
  canDispatchEffectiveNode,
  canExecuteTaskOnNode,
  materializeExecutionNodeId,
  resolveEffectiveNode,
} from "../effective-node.js";

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
});

describe("multi-node dispatch ownership", () => {
  const assigned = { nodeId: "node-pc1", source: "task-override" as const };
  const unpinned = { nodeId: undefined, source: "local" as const };

  it("allows only the matching identified process to dispatch assigned work", () => {
    expect(canDispatchEffectiveNode(assigned, "node-pc1")).toBe(true);
    expect(canDispatchEffectiveNode(assigned, "node-vps")).toBe(false);
  });

  it("preserves legacy behavior when the process has no configured identity", () => {
    expect(canDispatchEffectiveNode(assigned, undefined)).toBe(true);
  });

  it("allows unpinned work on any identified process and materializes the winner", () => {
    expect(canDispatchEffectiveNode(unpinned, "node-pc1")).toBe(true);
    expect(materializeExecutionNodeId(unpinned, "node-pc1")).toBe("node-pc1");
  });

  it("keeps an explicit assignment when persisting the execution node", () => {
    expect(materializeExecutionNodeId(assigned, "node-vps")).toBe("node-pc1");
    expect(materializeExecutionNodeId(unpinned, undefined)).toBeNull();
  });

  it("rejects event execution when persisted ownership belongs to another node", () => {
    expect(
      canExecuteTaskOnNode(
        { nodeId: "node-pc1", effectiveNodeId: "node-pc1" },
        "node-vps",
      ),
    ).toBe(false);
    expect(
      canExecuteTaskOnNode(
        { nodeId: undefined, effectiveNodeId: "node-pc1" },
        "node-pc1",
      ),
    ).toBe(true);
  });
});
