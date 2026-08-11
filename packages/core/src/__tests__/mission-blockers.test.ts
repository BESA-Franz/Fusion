import { describe, expect, it } from "vitest";
import {
  MISSION_BLOCKER_DESCRIPTOR_SCHEMA_VERSION,
  fromLegacyMissionBlocker,
  isMissionBlockerDescriptor,
  normalizeMissionBlockerReason,
  sortMissionBlockerDescriptors,
  toLegacyMissionBlocker,
} from "../index.js";

describe("mission blocker descriptors", () => {
  it("normalizes known and unknown persisted stop reasons fail-closed", () => {
    for (const reason of ["budget-exhausted", "operator-intervention", "legacy-unknown-stop"] as const) expect(normalizeMissionBlockerReason(reason)).toEqual({ reason });
    expect(normalizeMissionBlockerReason(undefined)).toEqual({ reason: "legacy-unknown-stop" });
    expect(normalizeMissionBlockerReason(null)).toEqual({ reason: "legacy-unknown-stop" });
    expect(normalizeMissionBlockerReason("")).toEqual({ reason: "legacy-unknown-stop" });
    expect(normalizeMissionBlockerReason("garbage-from-a-plugin")).toEqual({ reason: "legacy-unknown-stop", rawReason: "garbage-from-a-plugin" });
  });

  it("gates descriptors by their versioned shape", () => {
    const descriptor = fromLegacyMissionBlocker({ id: "F-1", reason: "budget-exhausted" }, "feature-row");
    expect(isMissionBlockerDescriptor(descriptor)).toBe(true);
    expect(isMissionBlockerDescriptor({ id: "F-1", reason: "budget-exhausted" })).toBe(false);
    expect(isMissionBlockerDescriptor({ ...descriptor, schemaVersion: 2 })).toBe(false);
    expect(isMissionBlockerDescriptor(null)).toBe(false);
    expect(descriptor.schemaVersion).toBe(MISSION_BLOCKER_DESCRIPTOR_SCHEMA_VERSION);
  });

  it("upgrades v0 entries and retains their v0 projection", () => {
    const canonical = fromLegacyMissionBlocker({ id: "F-1", reason: "budget-exhausted" }, "feature-row");
    expect(toLegacyMissionBlocker(canonical)).toEqual({ id: "F-1", reason: "budget-exhausted" });
    const unknown = fromLegacyMissionBlocker({ id: "F-2", reason: "old-plugin-stop" }, "lineage-stop");
    expect(unknown).toMatchObject({ reason: "legacy-unknown-stop", rawReason: "old-plugin-stop" });
  });

  it("sorts same-root sources deterministically without mutating input", () => {
    const lineage = fromLegacyMissionBlocker({ id: "F-1", reason: "budget-exhausted" }, "lineage-stop");
    const feature = fromLegacyMissionBlocker({ id: "F-1", reason: "legacy-unknown-stop" }, "feature-row");
    const original = [lineage, feature];
    expect(sortMissionBlockerDescriptors(original)).toEqual([feature, lineage]);
    expect(original).toEqual([lineage, feature]);
  });
});
