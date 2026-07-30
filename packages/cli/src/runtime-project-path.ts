import type { CentralCore, RegisteredProject } from "@fusion/core";
import { normalize, resolve } from "node:path";

/**
 * Raised when a centrally registered project cannot be resolved for the
 * currently configured Fusion runtime node.
 */
export class RuntimeProjectPathError extends Error {
  constructor(
    message: string,
    public readonly context: {
      projectId: string;
      nodeId: string;
      registeredPath: string;
      causeName: string;
    },
  ) {
    super(message);
    this.name = "RuntimeProjectPathError";
  }
}

/*
FNXC:CLIProjectNodePath 2026-07-30-05:52:
Every CLI surface that opens or exposes a registered project path must resolve
that project through the configured runtime node mapping. A shared PostgreSQL
registry may retain a VPS path such as /workspace while a Windows worker needs
its own local path. Nodes without FUSION_NODE_ID preserve single-node behavior.
*/
export async function resolveProjectForRuntimeNode(
  central: CentralCore,
  project: RegisteredProject,
): Promise<RegisteredProject> {
  const nodeId = process.env.FUSION_NODE_ID?.trim();
  if (!nodeId) return project;

  try {
    const path = await central.resolveProjectWorkingDirectory(project.id, nodeId);
    return { ...project, path };
  } catch (error) {
    throw new RuntimeProjectPathError(
      `Project "${project.name}" has no usable path mapping for runtime node "${nodeId}".`,
      {
        projectId: project.id,
        nodeId,
        registeredPath: project.path,
        causeName: error instanceof Error ? error.name : "UnknownError",
      },
    );
  }
}

/**
 * Return only projects that have a usable path on the configured runtime node.
 * Without a runtime node, preserve the registry's single-node behavior.
 */
export async function listProjectsForRuntimeNode(
  central: CentralCore,
  projects: RegisteredProject[],
): Promise<RegisteredProject[]> {
  const nodeId = process.env.FUSION_NODE_ID?.trim();
  if (!nodeId) return projects;

  /*
   * Missing mappings are expected for projects assigned to other nodes, but a
   * database failure must still reject the operation. Query mappings directly
   * instead of swallowing every resolveProjectWorkingDirectory error.
   */
  const mappedPaths = await Promise.all(
    projects.map((project) => central.getProjectNodePath(project.id, nodeId)),
  );
  return projects.flatMap((project, index) =>
    mappedPaths[index] ? [{ ...project, path: mappedPaths[index] }] : [],
  );
}

/**
 * Find a project by the path visible to this runtime node.
 */
export async function findProjectForRuntimePath(
  central: CentralCore,
  path: string,
): Promise<RegisteredProject | undefined> {
  if (!process.env.FUSION_NODE_ID?.trim()) {
    return central.getProjectByPath(path);
  }

  const comparablePath = comparableProjectPath(path);
  const projects = await listProjectsForRuntimeNode(
    central,
    await central.listProjects(),
  );
  return projects.find(
    (project) => comparableProjectPath(project.path) === comparablePath,
  );
}

/**
 * Normalize paths for exact project matching. Windows project paths are
 * case-insensitive, while POSIX paths remain case-sensitive.
 */
export function comparableProjectPath(path: string): string {
  const normalizedPath = normalize(resolve(path));
  return process.platform === "win32"
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}
