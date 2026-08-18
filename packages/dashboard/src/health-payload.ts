import type { TaskStore } from "@fusion/core";
import type {
  DashboardMigrationHealth,
  DashboardTaskIdIntegrityHealth,
} from "./dashboard-postgres-health.js";

function buildTaskIdIntegrityHealth(report: DashboardTaskIdIntegrityHealth) {
  return {
    status: report.status,
    checkedAt: report.checkedAt,
    anomalies: report.anomalies,
    ...(report.status === "error" ? { error: report.error } : {}),
    recommendedAction:
      report.status === "anomaly"
        ? "Pause task delegation, inspect the affected task IDs, and run the allocator audit before creating new tasks."
        : report.status === "error"
          ? "Restore PostgreSQL connectivity and rerun the health check before creating new tasks."
          : null,
  };
}

export function buildHealthPayload(args: {
  database: ReturnType<TaskStore["getDatabaseHealth"]>;
  taskIdIntegrityReport: DashboardTaskIdIntegrityHealth;
  migration?: DashboardMigrationHealth;
  cliPackageVersion: string;
  engineAvailable: boolean;
  runtimeIdentity?: {
    build?: string;
    nodeId?: string;
    projectId?: string;
    migrationVersion: string;
  };
}) {
  const { database, cliPackageVersion, engineAvailable, migration, runtimeIdentity } = args;
  const taskIdIntegrity = buildTaskIdIntegrityHealth(args.taskIdIntegrityReport);
  return {
    // FNXC:RuntimeHealthIdentity 2026-08-18-16:35: release gates need a secret-free binding to the exact process identity.
    status: migration || !database.healthy || database.corruptionDetected || taskIdIntegrity.status !== "ok" ? "degraded" : "ok",
    version: cliPackageVersion,
    ...(runtimeIdentity?.build ? { build: runtimeIdentity.build } : {}),
    ...(runtimeIdentity ? {
      nodeId: runtimeIdentity.nodeId,
      projectId: runtimeIdentity.projectId,
      migrationVersion: runtimeIdentity.migrationVersion,
    } : {}),
    uptime: Math.floor(process.uptime()),
    /*
     * FNXC:DashboardHealth 2026-06-20-22:11:
     * Distinguish "engine not started" from "engine paused" so UI-only launches can explain why automation cannot run.
     */
    engine: {
      available: engineAvailable,
    },
    database,
    taskIdIntegrity,
    ...(migration ? { migration } : {}),
  };
}
