import type { ProjectSettings, Task } from "@fusion/core";

export type EffectiveNodeSource = "task-override" | "project-default" | "local";

export interface EffectiveNode {
  nodeId: string | undefined;
  source: EffectiveNodeSource;
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
 * Return whether this process may dispatch work for the resolved node.
 *
 * An unset local node id preserves the single-process/legacy behavior. Once a
 * process declares its identity, an explicit task or project node assignment
 * is fail-closed and only the matching process may move the task to execution.
 */
export function canDispatchEffectiveNode(
  effectiveNode: EffectiveNode,
  localNodeId: string | undefined,
): boolean {
  return !localNodeId || !effectiveNode.nodeId || effectiveNode.nodeId === localNodeId;
}

/**
 * Persist the concrete process node for otherwise-unpinned work in a shared
 * control plane so later workflow continuations remain on the dispatch winner.
 */
export function materializeExecutionNodeId(
  effectiveNode: EffectiveNode,
  localNodeId: string | undefined,
): string | null {
  return effectiveNode.nodeId ?? localNodeId ?? null;
}

/**
 * Defense-in-depth gate for event- and continuation-driven execution after the
 * scheduler has persisted a concrete node. The task override covers the brief
 * move-event window before post-dispatch metadata is written.
 */
export function canExecuteTaskOnNode(
  task: Pick<Task, "effectiveNodeId" | "nodeId">,
  localNodeId: string | undefined,
): boolean {
  const assignedNodeId = isSetNodeId(task.effectiveNodeId)
    ? task.effectiveNodeId
    : isSetNodeId(task.nodeId)
      ? task.nodeId
      : undefined;
  return !localNodeId || !assignedNodeId || assignedNodeId === localNodeId;
}
