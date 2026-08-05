import { describe, expect, it } from "vitest";
import { resolveLocalNodeId, resolveProcessNodeId } from "../tasks/distributed-task-id.js";

const nodes = [
  { id: "node_vps", type: "local" },
  { id: "node_pc2", type: "remote" },
  { id: "node_pc3", type: "remote" },
];

describe("resolveLocalNodeId", () => {
  it("uses the registry-local node when no process identity is configured", () => {
    expect(resolveLocalNodeId(nodes)).toBe("node_vps");
  });

  it("preserves the topology fallback when no registry-local node exists", () => {
    expect(resolveLocalNodeId([], "local")).toBe("local");
  });
});

describe("resolveProcessNodeId", () => {
  it("uses an explicitly configured process node even when the shared registry marks it remote", () => {
    expect(resolveProcessNodeId(nodes, " node_pc2 ")).toBe("node_pc2");
  });

  it("fails closed when the configured process node is absent from the shared registry", () => {
    expect(() => resolveProcessNodeId(nodes, "node_unknown")).toThrow(
      "Configured Fusion node not found: node_unknown",
    );
  });

  it("fails closed when no process identity is configured", () => {
    expect(() => resolveProcessNodeId(nodes, " ")).toThrow(
      "FUSION_NODE_ID is required for shared-database runtime startup",
    );
  });
});
