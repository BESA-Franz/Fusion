import { describe, expect, it, vi } from "vitest";
import { CentralCore } from "../central-core.js";
import type { NodeConfig } from "../types.js";

type DiscoveryLostContext = {
  discoveredNodes: Map<string, unknown>;
  getNodeByName: (name: string) => Promise<NodeConfig | undefined>;
  checkNodeHealth: (id: string) => Promise<NodeConfig["status"]>;
  updateNode: (id: string, updates: Partial<NodeConfig>) => Promise<NodeConfig>;
  emit: (event: string, name: string) => boolean;
};

type DiscoveryLostHandler = (
  this: DiscoveryLostContext,
  name: string,
) => Promise<void>;

describe("CentralCore discovery health precedence", () => {
  it("keeps an explicitly configured remote node online when mDNS loses it but HTTPS health succeeds", async () => {
    const node: NodeConfig = {
      id: "node_pc1",
      name: "besa-pc1-planner",
      type: "remote",
      url: "https://pc1.example.test",
      apiKey: "test-key",
      status: "online",
      maxConcurrent: 1,
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    };
    const checkNodeHealth = vi.fn().mockResolvedValue("online");
    const updateNode = vi.fn();
    const emit = vi.fn().mockReturnValue(true);
    const context: DiscoveryLostContext = {
      discoveredNodes: new Map([[node.name, {}]]),
      getNodeByName: vi.fn().mockResolvedValue(node),
      checkNodeHealth,
      updateNode,
      emit,
    };
    const handleDiscoveryNodeLost = (
      CentralCore.prototype as unknown as {
        handleDiscoveryNodeLost: DiscoveryLostHandler;
      }
    ).handleDiscoveryNodeLost;

    await handleDiscoveryNodeLost.call(context, node.name);

    expect(context.discoveredNodes.has(node.name)).toBe(false);
    expect(checkNodeHealth).toHaveBeenCalledWith(node.id);
    expect(updateNode).not.toHaveBeenCalledWith(node.id, { status: "offline" });
    expect(emit).toHaveBeenCalledWith("discovery:node:lost", node.name);
  });
});
