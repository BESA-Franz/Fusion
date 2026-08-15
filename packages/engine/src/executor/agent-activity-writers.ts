import {
  resolveAgentActivityAttribution,
  type AgentActivityAttributionClaim,
} from "@fusion/core";

/*
FNXC:AgentActivityStream 2026-08-15-02:42:
Keep attribution selection independent from the executor facade split. A reviewer routed for the
gate outranks the ambient task assignee; only the durable outbox may verify the roster claim.
*/
/**
 * Resolve the principal that owns a terminal workflow-gate result.
 * A routed workflow principal is authoritative; the task assignee is only the
 * fallback, and an unassigned gate belongs to the executor lane.
 */
export function resolveWorkflowGateActivityClaim(
  workflowPrincipalId: string | undefined,
  assignedAgentId: string | undefined,
): AgentActivityAttributionClaim {
  return resolveAgentActivityAttribution([
    ...(workflowPrincipalId ? [{ id: workflowPrincipalId, provenance: "roster" as const }] : []),
    ...(assignedAgentId ? [{ id: assignedAgentId, provenance: "roster" as const }] : []),
    { id: "executor", provenance: "lane" },
  ], "executor");
}
