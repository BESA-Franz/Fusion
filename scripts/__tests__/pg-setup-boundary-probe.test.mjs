import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyVitestOutput,
  parseProbeArgs,
  parseProbeEvents,
  summarizeBoundary,
} from "../pg-setup-boundary-probe.mjs";

/*
FNXC:PgSetupBoundaryProbe 2026-08-17-03:25:
FN-9139 keeps this report-only survey's unit proof connectionless: fixture strings validate the
parser and summary contract without spawning Vitest or making a PostgreSQL admission attempt.
*/

test("parseProbeArgs uses bounded defaults and accepts explicit positive integers", () => {
  assert.deepEqual(parseProbeArgs([]), { delayMs: 40, timeoutMs: 15, workers: 2 });
  assert.deepEqual(
    parseProbeArgs(["--delay-ms", "25", "--timeout-ms", "12", "--workers", "3"]),
    { delayMs: 25, timeoutMs: 12, workers: 3 },
  );
  assert.deepEqual(parseProbeArgs(["--help"]), { help: true });
});

test("parseProbeArgs rejects unknown, missing, and non-positive values", () => {
  assert.throws(() => parseProbeArgs(["--unexpected"]), /Unknown argument/);
  assert.throws(() => parseProbeArgs(["--workers"]), /positive integer/);
  assert.throws(() => parseProbeArgs(["--delay-ms", "0"]), /positive integer/);
  assert.throws(() => parseProbeArgs(["--timeout-ms", "1.5"]), /positive integer/);
});

test("parseProbeEvents retains only well-formed prefixed fixture events", () => {
  const output = [
    "ordinary Vitest output",
    'PG_SETUP_BOUNDARY_EVENT:{"type":"boundary","boundary":"global-setup","phase":"start","pid":42}',
    "PG_SETUP_BOUNDARY_EVENT:not-json",
    'PG_SETUP_BOUNDARY_EVENT:{"type":"test","boundary":"test","phase":"start","pid":42,"file":"one"}',
  ].join("\n");

  assert.deepEqual(parseProbeEvents(output), [
    { type: "boundary", boundary: "global-setup", phase: "start", pid: 42, outputIndex: 1 },
    { type: "test", boundary: "test", phase: "start", pid: 42, file: "one", outputIndex: 3 },
  ]);
});

test("classifyVitestOutput separates hook and test budgets from off-budget success", () => {
  assert.equal(classifyVitestOutput("Error: Hook timed out in 15ms.", 1), "hook-timeout");
  assert.equal(classifyVitestOutput("Error: Test timed out in 15ms.", 1), "test-timeout");
  assert.equal(classifyVitestOutput("all tests passed", 0), "off-budget");
  assert.equal(classifyVitestOutput("unexpected fixture failure", 1), "unknown-failure");
});

test("summarizeBoundary reports per-file execution and ordering before the first test", () => {
  const normalRun = {
    exitCode: 0,
    output: [
      'PG_SETUP_BOUNDARY_EVENT:{"type":"boundary","boundary":"per-file-before-all","phase":"start","pid":11,"file":"one"}',
      'PG_SETUP_BOUNDARY_EVENT:{"type":"boundary","boundary":"per-file-before-all","phase":"start","pid":12,"file":"two"}',
      'PG_SETUP_BOUNDARY_EVENT:{"type":"test","boundary":"test","phase":"start","pid":11,"file":"one"}',
    ].join("\n"),
  };
  const stressedRun = { exitCode: 1, output: "Error: Hook timed out in 15ms." };

  assert.deepEqual(summarizeBoundary("per-file-before-all", normalRun, stressedRun), {
    boundary: "per-file-before-all",
    granularity: "per file",
    executions: 2,
    workersObserved: 2,
    filesObserved: 2,
    timeoutCharge: "hook-timeout",
    orderingRelativeToFirstTest: "before-first-test",
  });
});

test("summarizeBoundary uses global invocation semantics and reports absent ordering honestly", () => {
  const normalRun = {
    exitCode: 0,
    output: 'PG_SETUP_BOUNDARY_EVENT:{"type":"boundary","boundary":"global-setup","phase":"start","pid":99}',
  };
  const stressedRun = { exitCode: 0, output: "passed" };

  assert.deepEqual(summarizeBoundary("global-setup", normalRun, stressedRun), {
    boundary: "global-setup",
    granularity: "per invocation",
    executions: 1,
    workersObserved: 1,
    filesObserved: 0,
    timeoutCharge: "off-budget",
    orderingRelativeToFirstTest: "not-observed",
  });
});
