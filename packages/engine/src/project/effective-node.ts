import type { ProjectSettings, Task } from "@fusion/core";

export type EffectiveNodeSource = "task-override" | "project-default" | "local";

export interface EffectiveNode {
  nodeId: string | undefined;
  source: EffectiveNodeSource;
}

export interface RuntimeNodeRoute {
  /** Registry identity represented by the current Fusion process. */
  localNodeId?: string;
  /** Only the central/local orchestrator accepts tasks without an explicit route. */
  acceptUnassignedTasks?: boolean;
}

function isSetNodeId(nodeId: string | null | undefined): nodeId is string {
  return typeof nodeId === "string" && nodeId.trim().length > 0;
}

export function resolveEffectiveNode(
  task: Pick<Task, "nodeId">,
  settings: Pick<ProjectSettings, "defaultNodeId">,
): EffectiveNode {
  if (isSetNodeId(task.nodeId)) {
    return { nodeId: task.nodeId, source: "task-override" };
  }

  if (isSetNodeId(settings.defaultNodeId)) {
    return { nodeId: settings.defaultNodeId, source: "project-default" };
  }

  return { nodeId: undefined, source: "local" };
}

/**
 * Decide whether the current process owns the filesystem side of a task.
 *
 * A shared PostgreSQL project is observed by every Fusion process. Persisting a
 * node id therefore is not enough: each planner/scheduler must reject foreign
 * routes before it reads PROMPT.md, creates a worktree, or moves the card. An
 * explicit route also fails closed when this process has no verified registry
 * identity. Unassigned work remains a central-orchestrator concern.
 */
export function shouldExecuteOnRuntime(
  effectiveNode: EffectiveNode,
  runtime: RuntimeNodeRoute,
): boolean {
  if (effectiveNode.nodeId !== undefined) {
    return runtime.localNodeId !== undefined && effectiveNode.nodeId === runtime.localNodeId;
  }

  return runtime.acceptUnassignedTasks !== false;
}
