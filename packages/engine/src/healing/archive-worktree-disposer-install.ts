import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {join} from "node:path";
import {canonicalizeWorktreePath, getArchiveWorkspaceWorktreeDisposer, getArchiveWorktreeDisposer, registerArchiveWorkspaceWorktreeDisposer, registerArchiveWorktreeDisposer, type Settings, type Task, type TaskStore} from "@fusion/core";
import {canExecuteTaskOnNode} from "../project/effective-node.js";
import {removeWorktree, RemovalReason} from "../worktree/worktree-backend.js";
import {isRegisteredGitWorktree} from "../worktree/worktree-pool.js";

const execFileAsync = promisify(execFile);

type BaselineArchiveWorktreeDisposerInput = {
  rootDir: string;
  getSettings: () => Promise<Partial<Settings>>;
  getLocalNodeId?: () => string | undefined | Promise<string | undefined>;
  getLocalProjectPath?: () => string | undefined | Promise<string | undefined>;
};

function assignedNodeId(task: Pick<Task, "effectiveNodeId" | "nodeId">): string | undefined {
  const effectiveNodeId = task.effectiveNodeId?.trim();
  if (effectiveNodeId) return effectiveNodeId;
  const nodeId = task.nodeId?.trim();
  return nodeId || undefined;
}

async function resolveLocalDisposalContext(
  task: Pick<Task, "effectiveNodeId" | "nodeId">,
  input: BaselineArchiveWorktreeDisposerInput,
): Promise<{allowed: true; rootDir: string} | {allowed: false}> {
  if (!assignedNodeId(task)) return {allowed: true, rootDir: input.rootDir};
  let localNodeId: string | undefined;
  if (input.getLocalNodeId) {
    try {
      localNodeId = (await input.getLocalNodeId())?.trim() || undefined;
    } catch {
      // An unresolved process identity can never authorize destructive node-local cleanup.
      return {allowed: false};
    }
  } else {
    // Long-lived hosts already select their process identity through this canonical override.
    localNodeId = process.env.FUSION_NODE_ID?.trim() || undefined;
  }
  if (!localNodeId || !canExecuteTaskOnNode(task, localNodeId)) return {allowed: false};

  if (!input.getLocalProjectPath) return {allowed: true, rootDir: input.rootDir};
  try {
    const mappedRootDir = (await input.getLocalProjectPath())?.trim();
    return mappedRootDir ? {allowed: true, rootDir: mappedRootDir} : {allowed: false};
  } catch {
    // A central canonical path may belong to another operating system. Never fall
    // back to it when an explicit node-local mapping was requested but unavailable.
    return {allowed: false};
  }
}

async function assertRegisteredToRepository(rootDir: string, worktreePath: string): Promise<void> {
  if (await isRegisteredGitWorktree(rootDir, worktreePath)) return;
  throw new Error(`Refusing to remove archive worktree not registered to repository root: ${worktreePath}`);
}

/**
 * FNXC:WorkflowLifecycle 2026-07-16-10:00:
 * CLI/fn archive paths can own a store without constructing an executor. This
 * presence-guarded baseline uses the configured backend, while an executor may
 * replace it with its session-aware disposer for the same store.
 */
export function installBaselineArchiveWorktreeDisposer(store: TaskStore, input: BaselineArchiveWorktreeDisposerInput): () => void {
  const unregisterSingle = getArchiveWorktreeDisposer(store) ? () => {} : registerArchiveWorktreeDisposer(store, async (task) => {
    if (!task.worktree) return;
    /*
    FNXC:MultiNodeArchiveWorktreeCleanup 2026-08-01-15:00:
    Persisted worktree paths are node-local. Baseline archive cleanup may touch Git only when the task's effective owner resolves to this process; an explicit owner with unavailable or different local identity is a successful remote skip, not a removal failure that quarantines the path.
    */
    const disposalContext = await resolveLocalDisposalContext(task, input);
    if (!disposalContext.allowed) return;
    if (await canonicalizeWorktreePath(task.worktree) === await canonicalizeWorktreePath(disposalContext.rootDir)) return;
    await assertRegisteredToRepository(disposalContext.rootDir, task.worktree);
    await removeWorktree({worktreePath: task.worktree, rootDir: disposalContext.rootDir, settings: await input.getSettings(), taskId: task.id, reason: RemovalReason.ExecutorDispose, force: true});
    task.worktree = undefined;
  });
  const unregisterWorkspace = getArchiveWorkspaceWorktreeDisposer(store) ? () => {} : registerArchiveWorkspaceWorktreeDisposer(store, async (task, plan) => {
    const disposalContext = await resolveLocalDisposalContext(task, input);
    if (!disposalContext.allowed) {
      return {removed: [], skipped: plan.map((entry) => entry.repoRel), failed: []};
    }
    const removed: string[] = [];
    const failed: {repoRel: string; error: unknown}[] = [];
    for (const entry of plan) {
      try {
        const repoRootDir = join(disposalContext.rootDir, entry.repoRel);
        if (await canonicalizeWorktreePath(entry.worktreePath) === await canonicalizeWorktreePath(repoRootDir)) throw new Error("Refusing to remove workspace repository root");
        await assertRegisteredToRepository(repoRootDir, entry.worktreePath);
        await removeWorktree({worktreePath: entry.worktreePath, rootDir: repoRootDir, settings: await input.getSettings(), taskId: task.id, reason: RemovalReason.ExecutorDispose, force: true});
        /* FNXC:WorkflowLifecycle 2026-07-16-16:00: Archive metadata can contain valid Git refs with shell metacharacters. Pass the ref as an argv value so cleanup never evaluates it as shell code. */
        await execFileAsync("git", ["branch", "-D", entry.branch], {cwd: repoRootDir, timeout: 120_000, maxBuffer: 10 * 1024 * 1024});
        if (task.workspaceWorktrees) for (const repoRel of [entry.repoRel, ...entry.aliasRepoRels]) delete task.workspaceWorktrees[repoRel];
        removed.push(entry.repoRel);
      } catch (error) {
        failed.push({repoRel: entry.repoRel, error});
      }
    }
    return {removed, failed};
  });
  return () => { unregisterWorkspace(); unregisterSingle(); };
}
