import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../api/client/client.js";
import { parseMissionResumeConflict } from "../../api/missions/missions.js";

const descriptor = { schemaVersion: 1, kind: "mission-resume-conflict", rootFeatureId: "F-root", reason: "budget-exhausted", source: "feature-row" } as const;

describe("MissionManager resume-conflict presentation input", () => {
  it("keeps v1 root ids and reasons for the operator toast", () => {
    const parsed = parseMissionResumeConflict(new ApiRequestError("conflict", 409, { code: "MISSION_RESUME_CONFLICT", blockerSchemaVersion: 1, blockers: [descriptor, { ...descriptor, rootFeatureId: "F-second", reason: "legacy-unknown-stop" }] }));
    expect(parsed?.blockers.map((blocker) => `${blocker.rootFeatureId} — ${blocker.reason}`)).toEqual([
      "F-root — budget-exhausted",
      "F-second — legacy-unknown-stop",
    ]);
  });

  it("upgrades the legacy mirror before rendering the same operator text", () => {
    const parsed = parseMissionResumeConflict(new ApiRequestError("conflict", 409, { code: "MISSION_RESUME_CONFLICT", legacyBlockers: [{ id: "F-root", reason: "budget-exhausted" }] }));
    expect(parsed?.blockers.map((blocker) => `${blocker.rootFeatureId} — ${blocker.reason}`)).toEqual(["F-root — budget-exhausted"]);
  });

  it("leaves generic resume failures for the existing fallback toast", () => {
    expect(parseMissionResumeConflict(new Error("resume failed"))).toBeUndefined();
  });
});
