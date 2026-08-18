/*
FNXC:TestInfrastructure 2026-08-18-09:20:
The merge gate used a POSIX-only shell fan-out. Windows desktops do not
ship `sh`, and the old shell string also made the gate depend on shell syntax
for background jobs, PID variables, and `wait`. Keep the same three lanes
concurrent and wait for every lane, but express the orchestration in Node with
argument arrays so the pinned pnpm command works on every supported host.
*/

import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const corepackEntryPath = path.join(path.dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js");
const pnpmCommand = process.platform === "win32" && existsSync(corepackEntryPath) ? process.execPath : "pnpm";
const pnpmArgsPrefix = process.platform === "win32" && existsSync(corepackEntryPath) ? [corepackEntryPath, "pnpm"] : [];

export const GATE_LANES = Object.freeze([
  Object.freeze({ label: "engine core", args: ["--filter", "@fusion/engine", "test:core"] }),
  Object.freeze({ label: "core pg gate", args: ["--filter", "@fusion/core", "test:pg-gate"] }),
  Object.freeze({ label: "core unit gate", args: ["--filter", "@fusion/core", "test:unit-gate"] }),
]);

const CI_SHAPE_LANE = Object.freeze({
  label: "Fusion CLI CI shape",
  args: ["--filter", "@runfusion/fusion", "test:ci-shape"],
});

/**
 * Run one pnpm lane without a shell and resolve its process result.
 * @param {{label: string, args: string[]}} lane
 * @param {{spawnFn?: typeof spawn, cwd?: string}} [options]
 * @returns {Promise<{label: string, code: number|null, signal: string|null, error?: Error}>}
 */
export function runGateLane(lane, { spawnFn = spawn, cwd = repoRoot } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(pnpmCommand, [...pnpmArgsPrefix, ...lane.args], {
        cwd,
        env: process.env,
        stdio: "inherit",
      });
    } catch (error) {
      resolve({ label: lane.label, code: null, signal: null, error });
      return;
    }

    child.once("error", (error) => resolve({ label: lane.label, code: null, signal: null, error }));
    child.once("close", (code, signal) => resolve({ label: lane.label, code, signal }));
  });
}

function failureFromResult(result) {
  if (result.error) return result.error;
  const reason = result.signal ? `signal ${result.signal}` : `exit code ${result.code}`;
  const error = new Error(`[test:gate] ${result.label} failed (${reason})`);
  error.exitCode = result.code ?? 1;
  return error;
}

/**
 * Keep the historical gate shape: all three expensive lanes start together,
 * every lane settles, and the first lane in declaration order determines the
 * failure reported to the caller.
 */
export async function runConcurrentGateLanes({ run = runGateLane } = {}) {
  const results = await Promise.all(GATE_LANES.map((lane) => run(lane)));
  const failed = results.find((result) => result.error || result.signal || result.code !== 0);
  if (failed) throw failureFromResult(failed);
  return results;
}

export async function main({ run = runGateLane } = {}) {
  await runConcurrentGateLanes({ run });
  const result = await run(CI_SHAPE_LANE);
  if (result.error || result.signal || result.code !== 0) throw failureFromResult(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error?.message ?? String(error));
    process.exitCode = error?.exitCode ?? 1;
  });
}
