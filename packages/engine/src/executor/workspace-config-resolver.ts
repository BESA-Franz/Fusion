import { loadWorkspaceConfig, type WorkspaceConfig } from "@fusion/core";

/**
 * FNXC:Workspace 2026-08-14-21:06:
 * Workspace detection has one host-owned writer: a per-lane copy silently routes a multi-repo
 * project through its non-git root. Memoization is per host so concurrent projects and tests
 * cannot share configuration, and a config with no usable repositories is single-repo mode.
 */
const inFlightWorkspaceConfigLoads = new WeakMap<object, Promise<WorkspaceConfig | null>>();
const workspaceConfigEpochs = new WeakMap<object, number>();

/**
 * FNXC:Workspace 2026-08-15-05:28:
 * A settings toggle can change workspace.json while a prior disk read is pending. Bump an owner
 * epoch as well as deleting its promise so that stale completion cannot repopulate the old mode.
 */
export function invalidateWorkspaceConfigCache(owner: object): void {
  inFlightWorkspaceConfigLoads.delete(owner);
  workspaceConfigEpochs.set(owner, (workspaceConfigEpochs.get(owner) ?? 0) + 1);
}

export type WorkspaceConfigResolverDeps = {
  rootDir: string;
  workspaceConfigOwner: object;
  getWorkspaceConfig: () => WorkspaceConfig | null | undefined;
  setWorkspaceConfig: (config: WorkspaceConfig | null) => void;
};

export async function resolveWorkspaceConfigOnce(
  deps: WorkspaceConfigResolverDeps,
): Promise<WorkspaceConfig | null> {
  const current = deps.getWorkspaceConfig();
  if (current !== undefined) return current;

  const existing = inFlightWorkspaceConfigLoads.get(deps.workspaceConfigOwner);
  if (existing) return existing;

  const epoch = workspaceConfigEpochs.get(deps.workspaceConfigOwner) ?? 0;
  const promise = loadWorkspaceConfig(deps.rootDir).then((config) => {
    const normalized = config && config.repos.length > 0 ? config : null;
    if ((workspaceConfigEpochs.get(deps.workspaceConfigOwner) ?? 0) === epoch) {
      deps.setWorkspaceConfig(normalized);
    }
    return normalized;
  });
  inFlightWorkspaceConfigLoads.set(deps.workspaceConfigOwner, promise);
  try {
    return await promise;
  } finally {
    if (inFlightWorkspaceConfigLoads.get(deps.workspaceConfigOwner) === promise) {
      inFlightWorkspaceConfigLoads.delete(deps.workspaceConfigOwner);
    }
  }
}
