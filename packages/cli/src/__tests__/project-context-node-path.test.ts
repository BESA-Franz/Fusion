import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join, resolve } from "node:path";

function makeConstructibleMock<T extends (...args: any[]) => unknown>(impl?: T) {
  const mock = vi.fn(function () {});
  const originalMockImplementation = mock.mockImplementation.bind(mock);
  const wrap = (nextImpl: T) => function (this: unknown, ...args: Parameters<T>) {
    return nextImpl(...args);
  };
  mock.mockImplementation = ((nextImpl: T) =>
    originalMockImplementation(wrap(nextImpl))) as typeof mock.mockImplementation;
  if (impl) mock.mockImplementation(impl);
  return mock;
}

const mockCentralInit = vi.fn();
const mockCentralClose = vi.fn();
const mockGetProject = vi.fn();
const mockListProjects = vi.fn();
const mockGetProjectNodePath = vi.fn();
const mockResolveProjectWorkingDirectory = vi.fn();
const mockGlobalInit = vi.fn();
const mockGetSettings = vi.fn();
const mockHasProjectIdentity = vi.fn();
const mockIsValidSqliteDatabaseFile = vi.fn();
const mockReadProjectIdentity = vi.fn();
const mockShutdown = vi.fn();
const mockCreateTaskStoreForBackend = vi.fn();

vi.mock("@fusion/core", () => ({
  CentralCore: makeConstructibleMock(() => ({
    init: mockCentralInit,
    close: mockCentralClose,
    getProject: mockGetProject,
    listProjects: mockListProjects,
    getProjectNodePath: mockGetProjectNodePath,
    resolveProjectWorkingDirectory: mockResolveProjectWorkingDirectory,
  })),
  GlobalSettingsStore: makeConstructibleMock(() => ({
    init: mockGlobalInit,
    getSettings: mockGetSettings,
    updateSettings: vi.fn(),
  })),
  createTaskStoreForBackend: mockCreateTaskStoreForBackend,
  hasProjectIdentity: mockHasProjectIdentity,
  isValidSqliteDatabaseFile: mockIsValidSqliteDatabaseFile,
  readProjectIdentity: mockReadProjectIdentity,
}));

describe("project-context runtime node paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCentralInit.mockResolvedValue(undefined);
    mockCentralClose.mockResolvedValue(undefined);
    mockGlobalInit.mockResolvedValue(undefined);
    mockGetSettings.mockResolvedValue({});
    mockHasProjectIdentity.mockReturnValue(false);
    mockIsValidSqliteDatabaseFile.mockReturnValue(false);
    mockReadProjectIdentity.mockReturnValue(undefined);
    mockShutdown.mockResolvedValue(undefined);
    mockCreateTaskStoreForBackend.mockResolvedValue({
      taskStore: {},
      shutdown: mockShutdown,
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const { clearStoreCache } = await import("../project-context.js");
    await clearStoreCache();
  });

  it("opens an explicitly selected project at the configured node path", async () => {
    const project = {
      id: "proj_shared",
      name: "besa-suite",
      path: "/workspace",
      status: "active",
      isolationMode: "in-process",
      createdAt: "",
      updatedAt: "",
    };
    const localPath = resolve("C:\\BESA\\besa-suite");
    vi.stubEnv("FUSION_NODE_ID", "node_pc1");
    mockGetProject.mockResolvedValue(project);
    mockResolveProjectWorkingDirectory.mockResolvedValue(localPath);

    const { closeProjectStore, resolveProject } = await import("../project-context.js");
    const context = await resolveProject(project.id, process.cwd(), "C:\\fusion-home");

    expect(context.projectPath).toBe(localPath);
    expect(mockResolveProjectWorkingDirectory).toHaveBeenCalledWith(
      project.id,
      "node_pc1",
    );
    expect(mockCreateTaskStoreForBackend).toHaveBeenCalledWith({
      rootDir: localPath,
      globalSettingsDir: "C:\\fusion-home",
    });
    await closeProjectStore(context);
  });

  it("fails before opening a store when the selected project lacks a node path", async () => {
    const project = {
      id: "proj_shared",
      name: "besa-suite",
      path: "/workspace",
      status: "active",
      isolationMode: "in-process",
      createdAt: "",
      updatedAt: "",
    };
    vi.stubEnv("FUSION_NODE_ID", "node_pc1");
    mockGetProject.mockResolvedValue(project);
    mockResolveProjectWorkingDirectory.mockRejectedValue(
      new Error("mapping not found"),
    );

    const { resolveProject } = await import("../project-context.js");

    await expect(
      resolveProject(project.id, process.cwd(), "C:\\fusion-home"),
    ).rejects.toMatchObject({
      name: "RuntimeProjectPathError",
      context: {
        projectId: project.id,
        nodeId: "node_pc1",
        registeredPath: "/workspace",
      },
    });
    expect(mockCreateTaskStoreForBackend).not.toHaveBeenCalled();
  });

  it("detects a registered project by its configured node path", async () => {
    const localPath = resolve("C:\\BESA\\besa-suite");
    const project = {
      id: "proj_shared",
      name: "besa-suite",
      path: "/workspace",
      status: "active",
      isolationMode: "in-process",
      createdAt: "",
      updatedAt: "",
    };
    vi.stubEnv("FUSION_NODE_ID", "node_pc1");
    mockHasProjectIdentity.mockImplementation(
      (path) => path === join(localPath, ".fusion"),
    );
    mockListProjects.mockResolvedValue([project]);
    mockGetProjectNodePath.mockResolvedValue(localPath);

    const { detectProjectFromCwd } = await import("../project-context.js");
    const detected = await detectProjectFromCwd(localPath, {
      listProjects: mockListProjects,
      getProjectNodePath: mockGetProjectNodePath,
      resolveProjectWorkingDirectory: mockResolveProjectWorkingDirectory,
    } as never);

    expect(detected).toMatchObject({
      id: project.id,
      path: localPath,
    });
  });

  it("rejects a project identity opened from a path other than its node mapping", async () => {
    const detectedPath = resolve("C:\\BESA\\wrong-checkout");
    const mappedPath = resolve("C:\\BESA\\besa-suite");
    const project = {
      id: "proj_shared",
      name: "besa-suite",
      path: "/workspace",
      status: "active",
      isolationMode: "in-process",
      createdAt: "",
      updatedAt: "",
    };
    vi.stubEnv("FUSION_NODE_ID", "node_pc1");
    mockHasProjectIdentity.mockImplementation(
      (path) => path === join(detectedPath, ".fusion"),
    );
    mockReadProjectIdentity.mockReturnValue({
      id: project.id,
      createdAt: "2026-07-30T00:00:00.000Z",
    });
    mockListProjects.mockResolvedValue([project]);
    mockGetProjectNodePath.mockResolvedValue(mappedPath);
    mockResolveProjectWorkingDirectory.mockResolvedValue(mappedPath);

    const { detectProjectFromCwd } = await import("../project-context.js");

    await expect(
      detectProjectFromCwd(detectedPath, {
        listProjects: mockListProjects,
        getProjectNodePath: mockGetProjectNodePath,
        resolveProjectWorkingDirectory: mockResolveProjectWorkingDirectory,
      } as never),
    ).rejects.toMatchObject({
      name: "RuntimeProjectPathError",
      context: {
        projectId: project.id,
        nodeId: "node_pc1",
        causeName: "ProjectIdentityPathMismatch",
      },
    });
  });
});
