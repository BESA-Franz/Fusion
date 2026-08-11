import { describe, expect, it } from "vitest";
import { classifyMissionResumeBlockers } from "../missions/mission-types.js";

describe("classifyMissionResumeBlockers", () => {
  it("keeps the legacy resume projection while offering deduplicated canonical diagnostics", () => {
    const result = classifyMissionResumeBlockers({
      rootFeatures: [
        { id: "f-budget", implementationStopReason: "budget-exhausted" },
        { id: "f-operator", implementationStopReason: "operator-intervention" },
        { id: "f-legacy", implementationStopReason: undefined },
      ],
      lineageStops: [
        { rootFeatureId: "f-budget", reason: "budget-exhausted" },
        { rootFeatureId: "f-budget", reason: "other-stop" },
        { rootFeatureId: "f-lineage", reason: "budget-exhausted" },
        { rootFeatureId: "f-operator", reason: "operator-intervention" },
      ],
    });
    expect(result.blockers).toEqual([
      { featureId: "f-budget", reason: "budget-exhausted", source: "feature-stop" },
      { featureId: "f-budget", reason: "other-stop", source: "lineage-stop" },
      { featureId: "f-legacy", reason: "legacy-unknown-stop", source: "feature-stop" },
      { featureId: "f-lineage", reason: "budget-exhausted", source: "lineage-stop" },
    ]);
    expect(result.resumeConflictBlockers).toEqual([
      { id: "f-budget", reason: "budget-exhausted" },
      { id: "f-budget", reason: "budget-exhausted" },
      { id: "f-budget", reason: "other-stop" },
      { id: "f-legacy", reason: "legacy-unknown-stop" },
      { id: "f-lineage", reason: "budget-exhausted" },
    ]);
    expect(result.clearableFeatureIds).toEqual(["f-operator", "f-budget"]);
  });

  it("returns empty projections when there are no stops", () => {
    expect(classifyMissionResumeBlockers({ rootFeatures: [], lineageStops: [] })).toEqual({
      blockers: [], resumeConflictBlockers: [], clearableFeatureIds: [],
    });
  });
});
