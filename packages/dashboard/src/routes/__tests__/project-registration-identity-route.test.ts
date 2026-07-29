// @vitest-environment node

import express from "express";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeProjectIdentity } from "@fusion/core";
import { request } from "../../test-request.js";
import { registerProjectRoutes } from "../register-project-routes.js";

vi.mock("../../project-store-resolver.js", () => ({
  getOrCreateProjectStore: vi.fn().mockRejectedValue(new Error("not needed by this route test")),
  evictProjectStore: vi.fn(),
}));

const temporaryRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "fusion-project-identity-route-"));
  temporaryRoots.push(root);
  return root;
}

function appFor(options?: { registeredProjectId?: string }) {
  const ensureProjectForPath = vi.fn(async (input: {
    path: string;
    name: string;
    identity?: { id: string; createdAt: string };
  }) => {
    const now = "2026-07-29T12:00:00.000Z";
    return {
      project: {
        id: options?.registeredProjectId ?? input.identity?.id ?? "proj_aaaaaaaaaaaaaaaa",
        name: input.name,
        path: input.path,
        status: "initializing" as const,
        isolationMode: "in-process" as const,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
      reattached: Boolean(input.identity),
      outcome: "existing" as const,
    };
  });
  const updateProject = vi.fn(async (id: string) => {
    const ensured = ensureProjectForPath.mock.results.at(-1)?.value;
    const result = ensured ? await ensured : undefined;
    return { ...result?.project, id, status: "active" as const };
  });

  const router = express.Router();
  registerProjectRoutes({
    router,
    options: {
      centralCore: {
        ensureProjectForPath,
        updateProject,
        isInitialized: () => true,
      },
    },
    runtimeLogger: {
      warn: vi.fn(),
      child: () => ({ warn: vi.fn() }),
    },
    prioritizeProjectsForCurrentDirectory: vi.fn((projects) => projects),
    rethrowAsApiError: (error: unknown) => {
      throw error;
    },
  } as never);

  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((
    error: { statusCode?: number; status?: number; message?: string; details?: unknown },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(error.statusCode ?? error.status ?? 500).json({
      error: error.message,
      details: error.details,
    });
  });

  return { app, ensureProjectForPath };
}

async function register(app: express.Express, path: string, projectId: string) {
  return request(
    app,
    "POST",
    "/api/projects",
    JSON.stringify({ name: "besa-suite", path, projectId, skipGitInit: true }),
    { "content-type": "application/json" },
  );
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("project registration identity contract", () => {
  const sharedProjectId = "proj_f2c9d44f12524e93";

  it("registers an unmarked remote path with the explicitly requested shared project id", async () => {
    const root = createProjectRoot();
    const { app, ensureProjectForPath } = appFor();

    const response = await register(app, root, sharedProjectId);

    expect(response.status).toBe(201);
    expect(response.body.id).toBe(sharedProjectId);
    expect(ensureProjectForPath).toHaveBeenCalledWith(expect.objectContaining({
      path: root,
      identity: expect.objectContaining({ id: sharedProjectId }),
    }));
  });

  it("accepts a requested id that matches the on-disk identity", async () => {
    const root = createProjectRoot();
    const fusionDir = join(root, ".fusion");
    mkdirSync(fusionDir, { recursive: true });
    writeProjectIdentity(fusionDir, {
      id: sharedProjectId,
      createdAt: "2026-07-29T11:00:00.000Z",
    });
    const { app, ensureProjectForPath } = appFor();

    const response = await register(app, root, sharedProjectId);

    expect(response.status).toBe(201);
    expect(response.body.id).toBe(sharedProjectId);
    expect(ensureProjectForPath).toHaveBeenCalledWith(expect.objectContaining({
      identity: expect.objectContaining({ id: sharedProjectId }),
    }));
  });

  it("rejects a requested id that conflicts with the on-disk identity", async () => {
    const root = createProjectRoot();
    const fusionDir = join(root, ".fusion");
    mkdirSync(fusionDir, { recursive: true });
    writeProjectIdentity(fusionDir, {
      id: "proj_1111111111111111",
      createdAt: "2026-07-29T11:00:00.000Z",
    });
    const { app, ensureProjectForPath } = appFor();

    const response = await register(app, root, sharedProjectId);

    expect(response.status).toBe(409);
    expect(ensureProjectForPath).not.toHaveBeenCalled();
  });

  it("rejects a registry result that silently maps the path to another id", async () => {
    const root = createProjectRoot();
    const { app } = appFor({ registeredProjectId: "proj_2222222222222222" });

    const response = await register(app, root, sharedProjectId);

    expect(response.status).toBe(409);
  });

  it("rejects malformed requested project ids before registry access", async () => {
    const root = createProjectRoot();
    const { app, ensureProjectForPath } = appFor();

    const response = await register(app, root, "not-a-project-id");

    expect(response.status).toBe(400);
    expect(ensureProjectForPath).not.toHaveBeenCalled();
  });
});
