// @vitest-environment node

import { afterEach, describe, it, expect, vi } from "vitest";
import express from "express";
import type { TaskStore } from "@fusion/core";
import { createApiRoutes } from "../../routes.js";
import { request as REQUEST } from "../../test-request.js";

const makeTaskState = (overrides: Record<string, unknown> = {}) => ({
  id: "FN-001",
  description: "todo parked task",
  column: "todo",
  dependencies: [],
  steps: [],
  currentStep: 0,
  log: [],
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z",
  paused: undefined,
  userPaused: undefined,
  ...overrides,
} as any);

afterEach(() => {
  vi.unstubAllGlobals();
});

const ownerAwareCentral = (
  runtimeNodeId: string,
  ownerNode?: {
    id: string;
    status: "online" | "offline" | "connecting" | "error";
    url?: string;
    apiKey?: string;
  },
) => ({
  isInitialized: vi.fn(() => true),
  init: vi.fn(async () => undefined),
  getRuntimeNode: vi.fn(async () => ({ id: runtimeNodeId })),
  getNode: vi.fn(async (nodeId: string) => ownerNode?.id === nodeId ? ownerNode : undefined),
});

const createPauseRouteHarness = (initialTaskState: any, centralCore?: Record<string, unknown>) => {
  let taskState = initialTaskState;
  const store: TaskStore = {
    getRootDir: vi.fn(() => process.cwd()),
    /*
    FNXC:PluginMcpServers 2026-07-24-01:25:
    FN-8491 (3cd023fa4) binds a project-scoped plugin-MCP provider on every getProjectContext.
    Exposing getProjectScopedPluginMcpServers marks this mock as runtime-owned so the binder
    short-circuits instead of calling getPluginStore().
    */
    getProjectScopedPluginMcpServers: vi.fn(async () => []),
    getTask: vi.fn(async () => taskState),
    pauseTask: vi.fn(async (_id: string, paused: boolean) => {
      taskState = {
        ...taskState,
        paused: paused ? true : undefined,
        userPaused: paused ? taskState.userPaused : undefined,
        pausedByAgentId: paused ? taskState.pausedByAgentId : undefined,
      };
      return taskState;
    }),
  } as unknown as TaskStore;

  const app = express();
  app.use(express.json());
  app.use("/api", createApiRoutes(store, centralCore ? { centralCore: centralCore as never } : undefined));
  return { app, store, getTaskState: () => taskState };
};

describe("task workflow pause routes", () => {
  it("clears userPaused latch for todo user-paused tasks", async () => {
    const { app, store, getTaskState } = createPauseRouteHarness(makeTaskState({ userPaused: true }));

    const res = await REQUEST(app, "POST", "/api/tasks/FN-001/unpause", JSON.stringify({}), {
      "content-type": "application/json",
    });

    expect(res.status).toBe(200);
    expect(getTaskState().userPaused).toBeUndefined();
    expect(getTaskState().userPaused === true).toBe(false);
    expect(store.pauseTask).toHaveBeenCalledWith("FN-001", false);
  });

  it("allows agent-assigned paused tasks to be manually unpaused", async () => {
    const { app, store, getTaskState } = createPauseRouteHarness(makeTaskState({
      assignedAgentId: "agent-1",
      paused: true,
      pausedByAgentId: "agent-1",
    }));

    const res = await REQUEST(app, "POST", "/api/tasks/FN-001/unpause", JSON.stringify({}), {
      "content-type": "application/json",
    });

    expect(res.status).toBe(200);
    expect(getTaskState().paused).toBeUndefined();
    expect(getTaskState().pausedByAgentId).toBeUndefined();
    expect(store.pauseTask).toHaveBeenCalledWith("FN-001", false);
  });

  it("allows agent-assigned tasks to be manually paused", async () => {
    const { app, store, getTaskState } = createPauseRouteHarness(makeTaskState({ assignedAgentId: "agent-1" }));

    const res = await REQUEST(app, "POST", "/api/tasks/FN-001/pause", JSON.stringify({}), {
      "content-type": "application/json",
    });

    expect(res.status).toBe(200);
    expect(getTaskState().paused).toBe(true);
    expect(store.pauseTask).toHaveBeenCalledWith("FN-001", true);
  });

  it.each([
    ["pause", true],
    ["unpause", false],
  ] as const)("forwards remote %s with query, body, and owner auth without a local mutation", async (operation, paused) => {
    const central = ownerAwareCentral("node-pc1", {
      id: "node-pc3",
      status: "online",
      url: "https://pc3.example.test/base/",
      apiKey: "owner-node-key",
    });
    const { app, store } = createPauseRouteHarness(makeTaskState({
      nodeId: "node-pc3",
      paused: paused ? undefined : true,
    }), central);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(makeTaskState({
      nodeId: "node-pc3",
      paused: paused ? true : undefined,
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchImpl);
    const requestBody = { reason: "operator-control" };

    const res = await REQUEST(
      app,
      "POST",
      `/api/tasks/FN-001/${operation}?source=dashboard`,
      JSON.stringify(requestBody),
      { "content-type": "application/json" },
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(store.pauseTask).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [targetUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(targetUrl).toBe(`https://pc3.example.test/api/tasks/FN-001/${operation}?source=dashboard`);
    expect(init.headers).toMatchObject({
      authorization: "Bearer owner-node-key",
      "content-type": "application/json",
      "x-fusion-task-owner-hop": "node-pc1",
    });
    expect(JSON.parse(Buffer.from(init.body as Buffer).toString("utf8"))).toEqual(requestBody);
  });

  it("keeps a task bound to the local runtime on the local pause path", async () => {
    const central = ownerAwareCentral("node-pc3");
    const { app, store, getTaskState } = createPauseRouteHarness(makeTaskState({
      nodeId: "node-pc3",
    }), central);
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const res = await REQUEST(app, "POST", "/api/tasks/FN-001/pause", JSON.stringify({}), {
      "content-type": "application/json",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.pauseTask).toHaveBeenCalledTimes(1);
    expect(store.pauseTask).toHaveBeenCalledWith("FN-001", true);
    expect(getTaskState().paused).toBe(true);
  });
});
