import { describe, expect, it, vi } from "vitest";
import type { WorkflowIr } from "../workflows/workflow-ir-types.js";
import { resolveWorkflowIrById } from "../workflows/workflow-ir-resolver.js";

const CUSTOM_IR = {
  version: "v2",
  name: "concurrent-custom-flow",
  nodes: [{ id: "start", kind: "start" }, { id: "end", kind: "end" }],
  edges: [{ from: "start", to: "end" }],
  columns: [{ id: "todo", name: "Todo", traits: [] }],
} as unknown as WorkflowIr;

describe("resolveWorkflowIrById concurrent cache", () => {
  it("coalesces concurrent definition reads within one caller cache", async () => {
    let definitionReads = 0;
    const getWorkflowDefinition = vi.fn(async () => {
      definitionReads += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ir: CUSTOM_IR };
    });
    const store = {
      getWorkflowDefinition,
      getWorkflowSettingsProjectId: () => "project-concurrency-test",
    };
    const cache = new Map<string, WorkflowIr>();

    const resolved = await Promise.all(
      Array.from({ length: 8 }, () => resolveWorkflowIrById(store, "wf-concurrent", cache)),
    );

    expect(definitionReads).toBe(1);
    expect(resolved.every((ir) => ir === CUSTOM_IR)).toBe(true);
    expect(cache.get("wf-concurrent\u0000project-concurrency-test")).toBe(CUSTOM_IR);
  });
});
