#!/usr/bin/env node
/*
FNXC:MergeGatePortability 2026-08-16-17:00:
The merge gate must launch its three blocking package lanes concurrently on
Windows hosts where no POSIX `sh` is guaranteed. Keep the orchestration in a
Node process so shell quoting, `$!`, and `wait` semantics cannot change the
gate's fail-closed behavior by platform.
*/

import { spawn as defaultSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, "..");

export const GATE_LANES = Object.freeze([
  Object.freeze({ label: "engine-core", args: ["--filter", "@fusion/engine", "test:core"] }),
  Object.freeze({ label: "postgres", args: ["--filter", "@fusion/core", "test:pg-gate"] }),
  Object.freeze({ label: "core-unit", args: ["--filter", "@fusion/core", "test:unit-gate"] }),
]);

export function resolvePnpmCommand(platform = process.platform) {
  return platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export function findPnpmCli(platform = process.platform, environment = process.env, fileExists = existsSync) {
  if (platform !== "win32") return null;
  const pathValue = environment.Path ?? environment.PATH ?? "";
  for (const directory of pathValue.split(";")) {
    if (!directory) continue;
    const shimPath = resolve(directory, "pnpm.cmd");
    const cliPath = resolve(directory, "node_modules", "corepack", "dist", "pnpm.js");
    if (fileExists(shimPath) && fileExists(cliPath)) return cliPath;
  }
  return null;
}

export function resolvePnpmInvocation(
  platform = process.platform,
  environment = process.env,
  nodeBin = process.execPath,
  fileExists = existsSync,
) {
  const pnpmCli = findPnpmCli(platform, environment, fileExists);
  if (pnpmCli) {
    return { command: nodeBin, argsPrefix: [pnpmCli], shell: false };
  }
  return {
    command: resolvePnpmCommand(platform),
    argsPrefix: [],
    shell: platform === "win32",
  };
}

export function runGateLane(
  lane,
  {
    root = repoRoot,
    pnpmCommand = resolvePnpmCommand(),
    pnpmArgsPrefix = [],
    shell = false,
    spawnImpl = defaultSpawn,
  } = {},
) {
  return new Promise((resolveResult) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolveResult({ ...lane, ...result });
    };

    let child;
    try {
      child = spawnImpl(pnpmCommand, [...pnpmArgsPrefix, ...lane.args], {
        cwd: root,
        shell,
        stdio: "inherit",
      });
    } catch (error) {
      settle({ code: null, signal: null, error });
      return;
    }

    child.once("error", (error) => settle({ code: null, signal: null, error }));
    child.once("close", (code, signal) => settle({ code, signal }));
  });
}

export async function runGateLanes({
  root = repoRoot,
  platform = process.platform,
  environment = process.env,
  spawnImpl = defaultSpawn,
  log = console.log,
  errorLog = console.error,
} = {}) {
  const invocation = resolvePnpmInvocation(platform, environment);
  const results = await Promise.all(
    GATE_LANES.map((lane) => runGateLane(lane, {
      root,
      pnpmCommand: invocation.command,
      pnpmArgsPrefix: invocation.argsPrefix,
      shell: invocation.shell,
      spawnImpl,
    })),
  );
  const failures = results.filter((result) => result.error || result.code !== 0);
  for (const failure of failures) {
    const detail = failure.error?.message ?? (failure.signal ? `signal ${failure.signal}` : `exit ${failure.code}`);
    errorLog(`[gate-lanes] ${failure.label} failed (${detail})`);
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} merge-gate lane${failures.length === 1 ? "" : "s"} failed`);
  }
  log(`[gate-lanes] ${results.length} blocking lanes passed`);
  return results;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  try {
    await runGateLanes();
  } catch (error) {
    console.error(`[gate-lanes] ${error.message}`);
    process.exitCode = 1;
  }
}
