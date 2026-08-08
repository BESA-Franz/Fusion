// @vitest-environment node
//
// U4 hardening: `bypassGuards` is engine-internal (KTD-9). The HTTP move
// endpoint hardcodes its move options (mirroring the hardcoded
// `moveSource: "user"` posture) and must NEVER forward a caller-supplied
// `bypassGuards` (or `moveSource`) from the request body — otherwise a remote
// caller could bypass trait guards / abort-on-exit.

import { describe, it, expect, vi } from "vitest";
import express from "express";
import type { Task, TaskStore } from "@fusion/core";
import { createApiRoutes } from "../../routes.js";
import { request as REQUEST } from "../../test-request.js";

describe("task move route — bypassGuards is not forwardable", () => {
  it("ignores a caller-supplied bypassGuards/moveSource in the request body", async () => {
    const moveTask = vi.fn(async (_id: string, column: string, _options?: Record<string, unknown>) => ({
      id: "FN-001",
      column,
      dependencies: [],
      steps: [],
      currentStep: 0,
    }));

    const store: TaskStore = {
      getRootDir: vi.fn(() => process.cwd()),
      /*
      FNXC:PluginMcpServers 2026-07-24-01:25:
      FN-8491 (3cd023fa4) binds a project-scoped plugin-MCP provider on every getProjectContext.
      Exposing getProjectScopedPluginMcpServers marks this mock as runtime-owned so the binder
      short-circuits instead of calling getPluginStore().
      */
      getProjectScopedPluginMcpServers: vi.fn(async () => []),
      getTask: vi.fn(async () => ({ id: "FN-001", column: "todo" })),
      getSettings: vi.fn(async () => ({})),
      moveTask,
    } as unknown as TaskStore;

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-001/move",
      /*
      FNXC:WorkflowLifecycleColumns 2026-08-03-00:20 (red on main — a stale target column, not a route bug):
      THE TARGET WAS `triage`, AND U11 DELETED THAT COLUMN. The move route validates against the TASK'S
      WORKFLOW (U12/R2), and the default lineage post-#2515 declares
      `todo | in-progress | in-review | done | archived` — so the route correctly answered 400 "Invalid
      column", the request never reached `moveTask`, and every assertion below was unreachable.

      The route is right; the fixture outlived its column. Same class as the two assertions #2720 corrected in
      `task-dependency-mutation.pg.test.ts`: a test pinning an id the board no longer has, which reads as a
      product failure and is a test-maintenance failure.

      `in-progress` keeps this case's ACTUAL subject intact — that a caller-supplied `bypassGuards`/`moveSource`
      is not forwarded — and it is a forward move from `todo`, so the R16 backward-move PR guard stays out of
      the way. The point was never which column.
      */
      JSON.stringify({ column: "in-review", bypassGuards: true, moveSource: "engine" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(moveTask).toHaveBeenCalledTimes(1);
    const passedOptions = moveTask.mock.calls[0][2] as Record<string, unknown> | undefined;
    // The route constructs its own options; the injected fields must not leak.
    expect(passedOptions?.bypassGuards).toBeUndefined();
    // The route hardcodes moveSource: "user" — the body's "engine" is ignored.
    expect(passedOptions?.moveSource).toBe("user");
  });
});

describe("task move route — node-local worktree allocation", () => {
  function makeStore(nodeId: string) {
    const live = {
      id: "FN-REMOTE",
      title: "Remote",
      description: "",
      column: "todo",
      nodeId,
      dependencies: [],
      steps: [],
      currentStep: 0,
      workflowStepResults: [{
        workflowStepId: "plan-review",
        workflowStepName: "Plan Review",
        status: "passed",
        source: "node",
        phase: "pre-merge",
      }],
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    } as Task;
    let prepared: { dispatchRoute?: { effectiveNodeId: string | null; effectiveNodeSource: string }; allocateWorktree?: unknown } | null | undefined;
    const moveTaskIf = vi.fn(async (_id: string, column: string, predicate: (task: Task) => boolean | Promise<boolean>, options?: {
      prepareLockedMove?: (task: Task) => Promise<typeof prepared>;
    }) => {
      if (!await predicate(live)) return { task: live, moved: false };
      prepared = await options?.prepareLockedMove?.(live);
      if (prepared === null) return { task: live, moved: false };
      Object.assign(live, {
        column,
        effectiveNodeId: prepared?.dispatchRoute?.effectiveNodeId ?? undefined,
        effectiveNodeSource: prepared?.dispatchRoute?.effectiveNodeSource,
      });
      return { task: live, moved: true };
    });
    const store: TaskStore = {
      getRootDir: vi.fn(() => "C:\\pc1\\project"),
      getProjectScopedPluginMcpServers: vi.fn(async () => []),
      getTask: vi.fn(async () => live),
      getSettings: vi.fn(async () => ({})),
      getSettingsFast: vi.fn(async () => ({})),
      getTaskWorkflowSelectionAsync: vi.fn(async () => undefined),
      moveTaskIf,
    } as unknown as TaskStore;
    return { live, moveTaskIf, store, getPrepared: () => prepared };
  }

  function makeCentralCore(processNodeId: string) {
    return {
      listNodes: vi.fn(async () => [
        { id: processNodeId, name: "this process", type: "local", status: "online" },
        { id: "node-pc2", name: "other process", type: "remote", status: "online" },
      ]),
      getNode: vi.fn(async (id: string) => ({ id, url: "http://node-pc2.test", status: "online" })),
    };
  }

  it("does not allocate the request-serving PC's path for a task routed to another node", async () => {
    const { store, getPrepared } = makeStore("node-pc2");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200 } as Response);
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, {
      centralCore: makeCentralCore("node-pc1") as never,
      processNodeId: "node-pc1",
      registryLocalNodeId: "node-pc1",
    }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-REMOTE/move",
      JSON.stringify({ column: "in-progress" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(getPrepared()?.allocateWorktree).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it("keeps local worktree allocation when the request-serving process owns the target", async () => {
    const { store, getPrepared } = makeStore("node-pc1");
    const execute = vi.fn(async () => undefined);
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, {
      centralCore: makeCentralCore("node-pc1") as never,
      processNodeId: "node-pc1",
      registryLocalNodeId: "node-pc1",
      engine: { getRuntime: () => ({ getExecutor: () => ({ execute }) }) } as never,
    }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-REMOTE/move",
      JSON.stringify({ column: "in-progress" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(getPrepared()?.allocateWorktree).toEqual(expect.any(Function));
    expect(execute).toHaveBeenCalledOnce();
  });

  it("uses the live node route when ownership changes after the request snapshot", async () => {
    const { live, moveTaskIf, store, getPrepared } = makeStore("node-pc1");
    const originalMove = moveTaskIf.getMockImplementation()!;
    moveTaskIf.mockImplementation(async (...args) => {
      live.nodeId = "node-pc2";
      live.updatedAt = "2026-08-05T00:00:01.000Z";
      return originalMove(...args);
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200 } as Response);
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, {
      centralCore: makeCentralCore("node-pc1") as never,
      processNodeId: "node-pc1",
      registryLocalNodeId: "node-pc1",
    }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-REMOTE/move",
      JSON.stringify({ column: "in-progress" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(getPrepared()?.dispatchRoute?.effectiveNodeId).toBe("node-pc2");
    expect(getPrepared()?.allocateWorktree).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it("does not dispatch when a concurrent task change aborts the WIP move", async () => {
    const { live, moveTaskIf, store } = makeStore("node-pc1");
    moveTaskIf.mockResolvedValue({ task: live, moved: false });
    const execute = vi.fn(async () => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, {
      centralCore: makeCentralCore("node-pc1") as never,
      processNodeId: "node-pc1",
      registryLocalNodeId: "node-pc1",
      engine: { getRuntime: () => ({ getExecutor: () => ({ execute }) }) } as never,
    }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-REMOTE/move",
      JSON.stringify({ column: "in-progress" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rejects a target wake after the task leaves its WIP column", async () => {
    const { store } = makeStore("node-pc1");
    const execute = vi.fn(async () => undefined);
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, {
      centralCore: makeCentralCore("node-pc1") as never,
      processNodeId: "node-pc1",
      registryLocalNodeId: "node-pc1",
      engine: { getRuntime: () => ({ getExecutor: () => ({ execute }) }) } as never,
    }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-REMOTE/dispatch",
      JSON.stringify({ expectedNodeId: "node-pc1" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });

  it("promotes a remote-owned hold without allocating locally and wakes the target", async () => {
    const { store, getPrepared } = makeStore("node-pc2");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200 } as Response);
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, {
      centralCore: makeCentralCore("node-pc1") as never,
      processNodeId: "node-pc1",
      registryLocalNodeId: "node-pc1",
    }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-REMOTE/promote",
      JSON.stringify({}),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(getPrepared()?.dispatchRoute?.effectiveNodeId).toBe("node-pc2");
    expect(getPrepared()?.allocateWorktree).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });
});

/*
FNXC:WorkflowLifecycleColumns 2026-08-03-00:35 (added while fixing the red above):

THE PAIRED CASE THE SUITE WAS MISSING: an undeclared column must still be REJECTED.

The red above was a stale target, and the cheapest wrong fix would have been to relax the route's validation
until the old fixture passed again. This pins the behaviour that makes such a "fix" impossible: the route
validates the target against the TASK'S OWN workflow (U12/R2), so a column the board does not declare is a
400 — including `triage`, which the default lineage deleted in #2515.

Without this case, a future worker seeing "Invalid column" in a test failure has no way to tell a stale fixture
from a broken guard, which is exactly the half-hour I just spent.
*/
describe("task move route — the target column must be one the workflow declares", () => {
  it("rejects `triage`, which the default lineage no longer declares", async () => {
    const moveTask = vi.fn();
    const store: TaskStore = {
      getRootDir: vi.fn(() => process.cwd()),
      getProjectScopedPluginMcpServers: vi.fn(async () => []),
      getTask: vi.fn(async () => ({ id: "FN-002", column: "todo" })),
      getSettings: vi.fn(async () => ({})),
      moveTask,
    } as unknown as TaskStore;

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-002/move",
      JSON.stringify({ column: "triage" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(400);
    // The refusal must name the board's OWN columns, so an operator can act on it.
    expect(JSON.stringify(res.body)).toContain("in-progress");
    expect(moveTask).not.toHaveBeenCalled();
  });

  it("accepts a column the workflow DOES declare", async () => {
    // The paired positive: validation must not degrade into "reject everything".
    const moveTask = vi.fn(async (_id: string, column: string) => ({
      id: "FN-003", column, dependencies: [], steps: [], currentStep: 0,
    }));
    const store: TaskStore = {
      getRootDir: vi.fn(() => process.cwd()),
      getProjectScopedPluginMcpServers: vi.fn(async () => []),
      getTask: vi.fn(async () => ({ id: "FN-003", column: "todo" })),
      getSettings: vi.fn(async () => ({})),
      moveTask,
    } as unknown as TaskStore;

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-003/move",
      JSON.stringify({ column: "in-review" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(moveTask).toHaveBeenCalledTimes(1);
  });
});
