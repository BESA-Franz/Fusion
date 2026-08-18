import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "../health-payload.js";

describe("dashboard health runtime identity", () => {
  it("binds readiness to build, node, project, and migration without exposing configuration", () => {
    const payload = buildHealthPayload({
      database: {
        healthy: true,
        corruptionDetected: false,
        corruptionErrors: [],
        lastCheckedAt: new Date("2026-08-18T14:00:00.000Z"),
        isRunning: false,
      },
      taskIdIntegrityReport: {
        status: "ok",
        checkedAt: "2026-08-18T14:00:00.000Z",
        anomalies: [],
      },
      cliPackageVersion: "0.76.0",
      engineAvailable: true,
      runtimeIdentity: {
        build: "d146343ff-3a25beac",
        nodeId: "node_78c22bfa569e431e",
        projectId: "proj_f2c9d44f12524e93",
        migrationVersion: "0058",
      },
    });

    expect(payload).toMatchObject({
      status: "ok",
      version: "0.76.0",
      build: "d146343ff-3a25beac",
      nodeId: "node_78c22bfa569e431e",
      projectId: "proj_f2c9d44f12524e93",
      migrationVersion: "0058",
      database: { healthy: true },
      engine: { available: true },
    });
    expect(payload).not.toHaveProperty("environment");
    expect(payload).not.toHaveProperty("databaseUrl");
  });
});
