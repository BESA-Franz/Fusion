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
  task: Pick<Task, "effectiveNodeId" | "nodeId">,
  localNodeId: string | undefined,
  settings?: Pick<ProjectSettings, "defaultNodeId">,
  registryLocalNodeId?: string,
): boolean {
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
