import type { TaskStore } from "@fusion/core";

/**
 * FNXC:Workspace 2026-08-15-07:05:
 * Persist a display-only per-repository landing failure without altering merge control flow.
 * A fresh read preserves concurrent updates to sibling workspace entries and callers swallow errors.
 */
export async function persistWorkspaceRepoLandFailure(
  store: TaskStore,
  taskId: string,
  repoRel: string,
  failure: { message: string; at: string; branch?: string },
): Promise<void> {
  const latest = await store.getTask(taskId);
  const current = latest?.workspaceWorktrees ?? {};
  const entry = current[repoRel];
  if (!entry) return;
  await store.updateTask(taskId, {
    workspaceWorktrees: { ...current, [repoRel]: { ...entry, landFailure: failure } },
  });
}
