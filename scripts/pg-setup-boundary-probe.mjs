#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/*
FNXC:PgSetupBoundaryProbe 2026-08-17-03:25:
FN-9139 must establish whether Vitest lifecycle setup can host a future PostgreSQL admission
without changing the PostgreSQL harness. This isolated fixture observes only lifecycle timing and
never loads a repository config, a database client, or a project test suite.
*/

const require = createRequire(import.meta.url);
const BOUNDARIES = ["global-setup", "setup-top-level-await", "setup-before-all", "per-file-before-all"];
const DEFAULTS = Object.freeze({ delayMs: 40, timeoutMs: 15, workers: 2 });

export function parseProbeArgs(argv) {
  const options = { ...DEFAULTS };
  const names = new Map([
    ["--delay-ms", "delayMs"],
    ["--timeout-ms", "timeoutMs"],
    ["--workers", "workers"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { help: true };
    const name = names.get(argument);
    if (!name) throw new Error(`Unknown argument: ${argument}`);
    const value = Number(argv[++index]);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${argument} must be a positive integer`);
    }
    options[name] = value;
  }
  return options;
}

/** Extract deliberately prefixed fixture events without coupling classification to Vitest's reporter. */
export function parseProbeEvents(output) {
  return output.split(/\r?\n/).flatMap((line, index) => {
    const marker = line.indexOf("PG_SETUP_BOUNDARY_EVENT:");
    if (marker < 0) return [];
    try {
      const event = JSON.parse(line.slice(marker + "PG_SETUP_BOUNDARY_EVENT:".length));
      return [{ ...event, outputIndex: index }];
    } catch {
      return [];
    }
  });
}

/** Classify timeout ownership from stable Vitest diagnostic phrases, preserving unknown output. */
export function classifyVitestOutput(output, exitCode = 0) {
  if (/Hook timed out in \d+ms\./i.test(output)) return "hook-timeout";
  if (/Test timed out in \d+ms\./i.test(output)) return "test-timeout";
  if (exitCode === 0) return "off-budget";
  return "unknown-failure";
}

export function summarizeBoundary(boundary, normalRun, stressedRun) {
  const events = parseProbeEvents(normalRun.output);
  const starts = events.filter((event) => event.boundary === boundary && event.phase === "start");
  const firstTest = events.find((event) => event.type === "test" && event.phase === "start");
  const lastBoundary = starts.at(-1);
  const files = new Set(starts.map((event) => event.file).filter(Boolean));
  const pids = new Set(starts.map((event) => event.pid).filter(Boolean));
  const granularity = boundary === "global-setup"
    ? "per invocation"
    : files.size > 1
      ? "per file"
      : pids.size > 1
        ? "per worker"
        : "per invocation";

  return {
    boundary,
    granularity,
    executions: starts.length,
    workersObserved: pids.size,
    filesObserved: files.size,
    timeoutCharge: classifyVitestOutput(stressedRun.output, stressedRun.exitCode),
    orderingRelativeToFirstTest: !firstTest || !lastBoundary
      ? "not-observed"
      : lastBoundary.outputIndex < firstTest.outputIndex
        ? "before-first-test"
        : "after-first-test",
  };
}

function eventSource(type, boundary, phase, file = "") {
  return `console.log("PG_SETUP_BOUNDARY_EVENT:" + JSON.stringify({type:${JSON.stringify(type)},boundary:${JSON.stringify(boundary)},phase:${JSON.stringify(phase)},pid:process.pid,file:${JSON.stringify(file)}}));`;
}

function fixtureFiles(boundary, delayMs, timeoutMs, workers, vitestApiUrl) {
  const delay = `await new Promise((resolve) => setTimeout(resolve, ${delayMs}));`;
  // The fixture is outside the repository, so its Vitest API import must be absolute.
  const config = `export default { test: { include: ["tests/**/*.test.mjs"], pool: "forks", maxWorkers: ${workers}, minWorkers: ${workers}, testTimeout: ${timeoutMs}, hookTimeout: ${timeoutMs}, setupFiles: ["./setup.mjs"]${boundary === "global-setup" ? ', globalSetup: ["./global-setup.mjs"]' : ""} } };\n`;
  const setup = boundary === "setup-top-level-await"
    ? `${eventSource("boundary", boundary, "start")}${delay}${eventSource("boundary", boundary, "end")}`
    : boundary === "setup-before-all"
      ? `import { beforeAll } from ${JSON.stringify(vitestApiUrl)};\nbeforeAll(async () => { ${eventSource("boundary", boundary, "start")}${delay}${eventSource("boundary", boundary, "end")} });`
      : "";
  const global = boundary === "global-setup"
    ? `export default async function setup() { ${eventSource("boundary", boundary, "start")}${delay}${eventSource("boundary", boundary, "end")} }`
    : "export default async function setup() {}";
  const test = (file) => `import { beforeAll, test } from ${JSON.stringify(vitestApiUrl)};\n${boundary === "per-file-before-all" ? `beforeAll(async () => { ${eventSource("boundary", boundary, "start", file)}${delay}${eventSource("boundary", boundary, "end", file)} });` : ""}\ntest(${JSON.stringify(file)}, () => { ${eventSource("test", "test", "start", file)} });\n`;
  return {
    "vitest.config.mjs": config,
    "setup.mjs": setup,
    "global-setup.mjs": global,
    "tests/one.test.mjs": test("one"),
    "tests/two.test.mjs": test("two"),
  };
}

async function writeFixture(directory, files) {
  await Promise.all(Object.entries(files).map(async ([file, content]) => {
    const path = join(directory, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }));
}

function runVitest(directory) {
  const vitest = join(dirname(require.resolve("vitest", { paths: [resolve(process.cwd(), "packages/core")] })), "vitest.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vitest, "run", "--config", "vitest.config.mjs", "--reporter=verbose"], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ output, exitCode: exitCode ?? 1 }));
  });
}

async function runBoundary(boundary, options, stressed) {
  const directory = await mkdtemp(join(tmpdir(), "fusion-pg-setup-boundary-"));
  try {
    const delayMs = stressed ? Math.max(options.delayMs, options.timeoutMs + 20) : Math.min(options.delayMs, Math.max(1, options.timeoutMs - 1));
    const vitestApiUrl = pathToFileURL(require.resolve("vitest", { paths: [resolve(process.cwd(), "packages/core")] })).href;
    await writeFixture(directory, fixtureFiles(boundary, delayMs, options.timeoutMs, options.workers, vitestApiUrl));
    return await runVitest(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runProbe(options) {
  const summaries = [];
  for (const boundary of BOUNDARIES) {
    const normalRun = await runBoundary(boundary, options, false);
    const stressedRun = await runBoundary(boundary, options, true);
    summaries.push(summarizeBoundary(boundary, normalRun, stressedRun));
  }
  return summaries;
}

function printHelp() {
  console.log("Usage: node scripts/pg-setup-boundary-probe.mjs [--delay-ms N] [--timeout-ms N] [--workers N]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseProbeArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      console.table(await runProbe(options));
    }
  } catch (error) {
    console.error(`[pg-setup-boundary-probe] ${error.message}`);
    process.exitCode = 1;
  }
}
