import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const central = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  init: vi.fn(async () => undefined),
  listNodes: vi.fn(async () => [
    { id: "node_vps", type: "local" },
    { id: "node_pc2", type: "remote" },
  ]),
}));

vi.mock("../central/central-core.js", () => ({
  CentralCore: class {
    constructor() {
      return central;
    }
  },
}));

import { resolveLocalNodeIdForTaskAllocationImpl } from "../task-store/task-id-integrity.js";

describe("task ID allocation node identity", () => {
  let previousNodeId: string | undefined;
  let previousVitest: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousNodeId = process.env.FUSION_NODE_ID;
    previousVitest = process.env.VITEST;
    process.env.VITEST = "false";
  });

  afterEach(() => {
    if (previousNodeId === undefined) delete process.env.FUSION_NODE_ID;
    else process.env.FUSION_NODE_ID = previousNodeId;
    if (previousVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = previousVitest;
  });

  it("uses the configured process node even when it is registry-remote", async () => {
    process.env.FUSION_NODE_ID = "node_pc2";

    await expect(resolveLocalNodeIdForTaskAllocationImpl({} as never)).resolves.toBe("node_pc2");
    expect(central.close).toHaveBeenCalledOnce();
  });

  it("fails closed when the configured process node is not registered", async () => {
    process.env.FUSION_NODE_ID = "node_missing";

    await expect(resolveLocalNodeIdForTaskAllocationImpl({} as never)).rejects.toThrow(
      "Configured Fusion node not found: node_missing",
    );
    expect(central.close).toHaveBeenCalledOnce();
  });
});
