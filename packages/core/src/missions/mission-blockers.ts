/*
FNXC:MissionLineageBudget 2026-08-11-05:07:
The resume-conflict payload is a versioned contract. Unknown persisted stop reasons normalize
fail-closed to legacy-unknown-stop, never a resumable reason, while v0 { id, reason } remains only
for a bounded deprecation window.
*/
import {
  MISSION_BLOCKER_DESCRIPTOR_SCHEMA_VERSION,
  type LegacyMissionBlocker,
  type MissionBlockerDescriptor,
  type MissionBlockerReason,
  type MissionBlockerSource,
} from "./mission-types.js";

const KNOWN_REASONS = new Set<MissionBlockerReason>(["budget-exhausted", "operator-intervention", "legacy-unknown-stop"]);

export function normalizeMissionBlockerReason(raw: string | null | undefined): { reason: MissionBlockerReason; rawReason?: string } {
  if (raw && KNOWN_REASONS.has(raw as MissionBlockerReason)) return { reason: raw as MissionBlockerReason };
  return raw ? { reason: "legacy-unknown-stop", rawReason: raw } : { reason: "legacy-unknown-stop" };
}

export function createMissionBlockerDescriptor(input: { rootFeatureId: string; source: MissionBlockerSource; rawReason: string | null | undefined; missionId?: string; stoppedAt?: string; origin?: string }): MissionBlockerDescriptor {
  const normalized = normalizeMissionBlockerReason(input.rawReason);
  return { schemaVersion: MISSION_BLOCKER_DESCRIPTOR_SCHEMA_VERSION, kind: "mission-resume-conflict", rootFeatureId: input.rootFeatureId, reason: normalized.reason, source: input.source, ...(input.missionId ? { missionId: input.missionId } : {}), ...(input.stoppedAt ? { stoppedAt: input.stoppedAt } : {}), ...(input.origin ? { origin: input.origin } : {}), ...(normalized.rawReason ? { rawReason: normalized.rawReason } : {}) };
}

export function isMissionBlockerDescriptor(value: unknown): value is MissionBlockerDescriptor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === MISSION_BLOCKER_DESCRIPTOR_SCHEMA_VERSION && candidate.kind === "mission-resume-conflict" && typeof candidate.rootFeatureId === "string" && candidate.rootFeatureId.length > 0 && typeof candidate.reason === "string" && KNOWN_REASONS.has(candidate.reason as MissionBlockerReason) && (candidate.source === "feature-row" || candidate.source === "lineage-stop");
}

export function fromLegacyMissionBlocker(entry: LegacyMissionBlocker, source: MissionBlockerSource): MissionBlockerDescriptor {
  return createMissionBlockerDescriptor({ rootFeatureId: entry.id, source, rawReason: entry.reason });
}

export function toLegacyMissionBlocker(descriptor: MissionBlockerDescriptor): LegacyMissionBlocker {
  return { id: descriptor.rootFeatureId, reason: descriptor.reason };
}

export function sortMissionBlockerDescriptors(list: readonly MissionBlockerDescriptor[]): MissionBlockerDescriptor[] {
  return [...list].sort((a, b) => a.rootFeatureId.localeCompare(b.rootFeatureId) || (a.source === b.source ? 0 : a.source === "feature-row" ? -1 : 1) || a.reason.localeCompare(b.reason));
}
