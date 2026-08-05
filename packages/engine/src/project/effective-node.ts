import type { ProjectSettings, Task } from "@fusion/core";

export type EffectiveNodeSource = "task-override" | "project-default" | "local";

export interface EffectiveNode {
  nodeId: string | undefined;
  source: EffectiveNodeSource;
}

function isSetNodeId(nodeId: string | null | undefined): nodeId is string {
  return typeof nodeId === "string" && nodeId.trim().length > 0;
}

export function resolveAssignedNodeId(
  task: Pick<Task, "effectiveNodeId" | "nodeId">,
  settings?: Pick<ProjectSettings, "defaultNodeId">,
): string | undefined {
  const effectiveNodeId = task.effectiveNodeId?.trim();
  if (effectiveNodeId) return effectiveNodeId;
  const nodeId = task.nodeId?.trim();
  if (nodeId) return nodeId;
  const defaultNodeId = settings?.defaultNodeId?.trim();
  return defaultNodeId || undefined;
}

export function canExecuteTaskOnNode(
  task: Pick<Task, "effectiveNodeId" | "nodeId"> & Partial<Pick<Task, "effectiveNodeSource">>,
  localNodeId: string | undefined,
  settings?: Pick<ProjectSettings, "defaultNodeId">,
  registryLocalNodeId?: string,
): boolean {
  /*
  FNXC:SharedDatabaseNodeOwnership 2026-08-05-04:30:
  Once a locked move stamps an effective source, that persisted route is the
  decision. In particular `{ effectiveNodeSource: "local", effectiveNodeId:
  null }` means the registry-local node; it must not fall through to a stale
  task override or to project settings changed after the move.
  */
  if (task.effectiveNodeSource) {
    /*
    FNXC:SharedDatabaseNodeOwnership 2026-08-05-03:55:
    Callers that already pass the process's registry-local identity as
    localNodeId (triage and archive disposal) need the same persisted-local
    decision as the scheduler's explicit four-argument shape.
    */
    const persistedNodeId = task.effectiveNodeId?.trim()
      || (task.effectiveNodeSource === "local" ? (registryLocalNodeId ?? localNodeId)?.trim() : undefined);
    if (!persistedNodeId) return false;
    return localNodeId?.trim() === persistedNodeId;
  }
  const assignedNodeId = resolveAssignedNodeId(task, settings) ?? registryLocalNodeId?.trim();
  if (!assignedNodeId) return true;
  return localNodeId?.trim() === assignedNodeId;
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
