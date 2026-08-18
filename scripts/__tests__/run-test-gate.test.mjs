import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setImmediate } from "node:timers";

import {
  GATE_LANES,
  main,
  runConcurrentGateLanes,
  runGateLane,
} from "../run-test-gate.mjs";

test("runConcurrentGateLanes starts all expensive lanes before awaiting them", async () => {
  const started = [];
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const pending = runConcurrentGateLanes({
    run: async (lane) => {
      started.push(lane.label);
      await barrier;
      return { label: lane.label, code: 0, signal: null };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, GATE_LANES.map((lane) => lane.label));
  release();
  await pending;
});

test("main runs CI shape only after the three gate lanes succeed", async () => {
  const calls = [];
  await main({
    run: async (lane) => {
      calls.push(lane.label);
      return { label: lane.label, code: 0, signal: null };
    },
  });
  assert.deepEqual(calls, [...GATE_LANES.map((lane) => lane.label), "Fusion CLI CI shape"]);
});

test("runGateLane uses an argument array and inherited output without a shell", async () => {
  const child = new EventEmitter();
  let captured;
  const pending = runGateLane(GATE_LANES[0], {
    cwd: "C:\\repo",
    spawnFn: (command, args, options) => {
      captured = { command, args, options };
      return child;
    },
  });
  child.emit("close", 0, null);
  const result = await pending;

  assert.equal(result.code, 0);
  assert.ok(Array.isArray(captured.args));
  assert.equal(captured.options.cwd, "C:\\repo");
  assert.equal(captured.options.stdio, "inherit");
  assert.equal(captured.options.shell, undefined);
});
