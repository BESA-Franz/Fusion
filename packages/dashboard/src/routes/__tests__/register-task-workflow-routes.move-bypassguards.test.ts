// @vitest-environment node
//
// U4 hardening: `bypassGuards` is engine-internal (KTD-9). The HTTP move
// endpoint hardcodes its move options (mirroring the hardcoded
// `moveSource: "user"` posture) and must NEVER forward a caller-supplied
// `bypassGuards` (or `moveSource`) from the request body — otherwise a remote
// caller could bypass trait guards / abort-on-exit.

import { afterEach, describe, it, expect, vi } from "vitest";
import express from "express";
import type { TaskStore } from "@fusion/core";
import { createApiRoutes } from "../../routes.js";
import { request as REQUEST } from "../../test-request.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function ownerAwareCentral(
  runtimeNodeId: string,
  ownerNode?: {
    id: string;
    status: "online" | "offline" | "connecting" | "error";
    url?: string;
    apiKey?: string;
  },
) {
  return {
    isInitialized: vi.fn(() => true),
    init: vi.fn(async () => undefined),
    getRuntimeNode: vi.fn(async () => ({ id: runtimeNodeId })),
    getNode: vi.fn(async (nodeId: string) => ownerNode?.id === nodeId ? ownerNode : undefined),
  };
}

function nodeBoundMoveStore(taskId = "FN-REMOTE"): { store: TaskStore; moveTask: ReturnType<typeof vi.fn> } {
  const moveTask = vi.fn(async (_id: string, column: string) => ({
    id: taskId,
    column,
    nodeId: "node-pc3",
    dependencies: [],
    steps: [],
    currentStep: 0,
  }));
  const store = {
    getRootDir: vi.fn(() => "/workspace"),
    getTask: vi.fn(async () => ({
      id: taskId,
      column: "todo",
      nodeId: "node-pc3",
    })),
    getSettings: vi.fn(async () => ({})),
    getPluginStore: vi.fn(() => ({
      init: vi.fn(async () => undefined),
      listPlugins: vi.fn(async () => []),
    })),
    moveTask,
  } as unknown as TaskStore;
  return { store, moveTask };
}

describe("task move route", () => {
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
      getPluginStore: vi.fn(() => ({
        init: vi.fn(async () => undefined),
        listPlugins: vi.fn(async () => []),
      })),
      moveTask,
    } as unknown as TaskStore;

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-001/move",
      JSON.stringify({ column: "triage", bypassGuards: true, moveSource: "engine" }),
      { "content-type": "application/json" },
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(moveTask).toHaveBeenCalledTimes(1);
    const passedOptions = moveTask.mock.calls[0][2] as Record<string, unknown> | undefined;
    // The route constructs its own options; the injected fields must not leak.
    expect(passedOptions?.bypassGuards).toBeUndefined();
    // The route hardcodes moveSource: "user" — the body's "engine" is ignored.
    expect(passedOptions?.moveSource).toBe("user");
  });

  it("does not allocate the dashboard host worktree for a node-pinned task", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const moveTask = vi.fn(async (_id: string, column: string, _options?: Record<string, unknown>) => ({
      id: "FN-002",
      column,
      nodeId: "node-pc3",
      dependencies: [],
      steps: [],
      currentStep: 0,
    }));

    const store: TaskStore = {
      getRootDir: vi.fn(() => "/workspace"),
      getTask: vi.fn(async () => ({
        id: "FN-002",
        column: "todo",
        nodeId: "node-pc3",
      })),
      getSettings: vi.fn(async () => ({})),
      getPluginStore: vi.fn(() => ({
        init: vi.fn(async () => undefined),
        listPlugins: vi.fn(async () => []),
      })),
      moveTask,
    } as unknown as TaskStore;

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, {
      centralCore: ownerAwareCentral("node-pc3") as never,
    }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-002/move",
      JSON.stringify({ column: "in-progress" }),
      { "content-type": "application/json" },
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(moveTask).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    const passedOptions = moveTask.mock.calls[0][2] as Record<string, unknown> | undefined;
    expect(passedOptions?.allocateWorktree).toBeUndefined();
  });

  it("does not allocate the dashboard host worktree for a project-default node", async () => {
    const moveTask = vi.fn(async (_id: string, column: string, _options?: Record<string, unknown>) => ({
      id: "FN-003",
      column,
      dependencies: [],
      steps: [],
      currentStep: 0,
    }));

    const store: TaskStore = {
      getRootDir: vi.fn(() => "/workspace"),
      getTask: vi.fn(async () => ({
        id: "FN-003",
        column: "todo",
      })),
      getSettings: vi.fn(async () => ({ defaultNodeId: "node-pc3" })),
      getPluginStore: vi.fn(() => ({
        init: vi.fn(async () => undefined),
        listPlugins: vi.fn(async () => []),
      })),
      moveTask,
    } as unknown as TaskStore;

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-003/move",
      JSON.stringify({ column: "in-progress" }),
      { "content-type": "application/json" },
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const passedOptions = moveTask.mock.calls[0][2] as Record<string, unknown> | undefined;
    expect(passedOptions?.allocateWorktree).toBeUndefined();
  });

  it("forwards an explicit remote-node-bound move with query, body, and owner auth without a local mutation", async () => {
    const { store, moveTask } = nodeBoundMoveStore();
    const central = ownerAwareCentral("node-pc1", {
      id: "node-pc3",
      status: "online",
      url: "https://pc3.example.test/base/",
      apiKey: "owner-node-key",
    });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: "FN-REMOTE",
      column: "in-progress",
      nodeId: "node-pc3",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchImpl);

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, { centralCore: central as never }));

    const requestBody = {
      column: "in-progress",
      preserveProgress: true,
      bypassGuards: true,
    };
    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-REMOTE/move?source=dashboard",
      JSON.stringify(requestBody),
      { "content-type": "application/json" },
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      id: "FN-REMOTE",
      column: "in-progress",
      nodeId: "node-pc3",
    });
    expect(moveTask).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [targetUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(targetUrl).toBe("https://pc3.example.test/api/tasks/FN-REMOTE/move?source=dashboard");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer owner-node-key",
      "content-type": "application/json",
      "x-fusion-task-owner-hop": "node-pc1",
    });
    expect(JSON.parse(Buffer.from(init.body as Buffer).toString("utf8"))).toEqual(requestBody);
  });

  it.each(["offline", "error"] as const)("fails closed while the owner node status is %s", async (status) => {
    const { store, moveTask } = nodeBoundMoveStore(`FN-${status.toUpperCase()}`);
    const central = ownerAwareCentral("node-pc1", {
      id: "node-pc3",
      status,
      url: "https://pc3.example.test/",
    });
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, { centralCore: central as never }));

    const res = await REQUEST(
      app,
      "POST",
      `/api/tasks/FN-${status.toUpperCase()}/move`,
      JSON.stringify({ column: "triage" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(moveTask).not.toHaveBeenCalled();
  });

  it("fails closed when the owner node has no API key", async () => {
    const { store, moveTask } = nodeBoundMoveStore("FN-NO-KEY");
    const central = ownerAwareCentral("node-pc1", {
      id: "node-pc3",
      status: "online",
      url: "https://pc3.example.test/",
    });
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, { centralCore: central as never }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-NO-KEY/move",
      JSON.stringify({ column: "triage" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(moveTask).not.toHaveBeenCalled();
  });

  it("fails closed when the owner request errors", async () => {
    const { store, moveTask } = nodeBoundMoveStore("FN-ERROR");
    const central = ownerAwareCentral("node-pc1", {
      id: "node-pc3",
      status: "online",
      url: "https://pc3.example.test/",
      apiKey: "owner-node-key",
    });
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchImpl);

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, { centralCore: central as never }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-ERROR/move",
      JSON.stringify({ column: "triage" }),
      { "content-type": "application/json" },
    );

    expect(res.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(moveTask).not.toHaveBeenCalled();
  });

  it("rejects a second forwarding hop without mutating locally", async () => {
    const { store, moveTask } = nodeBoundMoveStore("FN-LOOP");
    const central = ownerAwareCentral("node-pc1", {
      id: "node-pc3",
      status: "online",
      url: "https://pc3.example.test/",
    });
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store, { centralCore: central as never }));

    const res = await REQUEST(
      app,
      "POST",
      "/api/tasks/FN-LOOP/move",
      JSON.stringify({ column: "triage" }),
      {
        "content-type": "application/json",
        "x-fusion-task-owner-hop": "node-other",
      },
    );

    expect(res.status).toBe(508);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(moveTask).not.toHaveBeenCalled();
  });
});
