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
      expect.objectContaining({ rootFeatureId: "f-budget", reason: "budget-exhausted", source: "feature-row" }),
      expect.objectContaining({ rootFeatureId: "f-budget", reason: "budget-exhausted", source: "lineage-stop" }),
      expect.objectContaining({ rootFeatureId: "f-budget", reason: "legacy-unknown-stop", source: "lineage-stop", rawReason: "other-stop" }),
      expect.objectContaining({ rootFeatureId: "f-legacy", reason: "legacy-unknown-stop", source: "feature-row" }),
      expect.objectContaining({ rootFeatureId: "f-lineage", reason: "budget-exhausted", source: "lineage-stop" }),
    ]);
    expect(result.clearableFeatureIds).toEqual(["f-operator", "f-budget"]);
  });

  it("returns empty projections when there are no stops", () => {
    expect(classifyMissionResumeBlockers({ rootFeatures: [], lineageStops: [] })).toEqual({
      blockers: [], clearableFeatureIds: [],
    });
  });
});
