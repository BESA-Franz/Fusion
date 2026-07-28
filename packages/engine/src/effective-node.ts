import type { ProjectSettings, Task } from "@fusion/core";

export type EffectiveNodeSource = "task-override" | "project-default" | "local";

export interface EffectiveNode {
  nodeId: string | undefined;
  source: EffectiveNodeSource;
}

function isSetNodeId(nodeId: string | null | undefined): nodeId is string {
  return typeof nodeId === "string" && nodeId.trim().length > 0;
}

function isEffectiveNodeSource(source: string | null | undefined): source is EffectiveNodeSource {
  return source === "task-override" || source === "project-default" || source === "local";
}

export function resolveEffectiveNode(
  task: Pick<Task, "nodeId" | "effectiveNodeId" | "effectiveNodeSource">,
  settings: Pick<ProjectSettings, "defaultNodeId">,
): EffectiveNode {
  if (isSetNodeId(task.nodeId)) {
    return { nodeId: task.nodeId, source: "task-override" };
  }

  /*
  FNXC:NodeRouting 2026-07-28-20:18:
  Replicated tasks can already carry the authoritative dispatch decision. Preserve
  that effective node before consulting the current project default so a remote
  worker cannot reinterpret an in-flight task after settings replication.
  */
  if (isSetNodeId(task.effectiveNodeId)) {
    return {
      nodeId: task.effectiveNodeId,
      source: isEffectiveNodeSource(task.effectiveNodeSource)
        ? task.effectiveNodeSource
        : "project-default",
    };
  }

  if (isSetNodeId(settings.defaultNodeId)) {
    return { nodeId: settings.defaultNodeId, source: "project-default" };
  }

  return { nodeId: undefined, source: "local" };
}

export function canDispatchEffectiveNode(
  effectiveNode: EffectiveNode,
  localNodeId: string | null | undefined,
): boolean {
  if (!isSetNodeId(effectiveNode.nodeId)) return true;
  return isSetNodeId(localNodeId) && effectiveNode.nodeId === localNodeId;
}
