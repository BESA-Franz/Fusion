import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  GATE_LANES,
  resolvePnpmInvocation,
  resolvePnpmCommand,
  runGateLanes,
} from "../run-gate-lanes.mjs";

function makeChild() {
  return new EventEmitter();
}

test("resolvePnpmCommand selects the Windows executable without a shell", () => {
  assert.equal(resolvePnpmCommand("win32"), "pnpm.cmd");
  assert.equal(resolvePnpmCommand("linux"), "pnpm");
});

test("resolvePnpmInvocation prefers the direct Corepack entrypoint on Windows", () => {
  const invocation = resolvePnpmInvocation("win32", {
    Path: "C:\\tools;C:\\node-runtime",
  }, "node.exe", (filePath) => filePath.endsWith("pnpm.cmd") || filePath.endsWith("node_modules\\corepack\\dist\\pnpm.js"));
  assert.equal(invocation.command, "node.exe");
  assert.equal(invocation.shell, false);
  assert.match(invocation.argsPrefix[0], /node_modules[\\/]corepack[\\/]dist[\\/]pnpm\.js$/);
});

test("runGateLanes starts every blocking lane before waiting", async () => {
  const calls = [];
  const children = [];
  const spawnImpl = (command, args, options) => {
    const child = makeChild();
    calls.push({ command, args, options });
    children.push(child);
    return child;
  };

  const resultPromise = runGateLanes({ platform: "win32", environment: { Path: "" }, spawnImpl, log: () => {} });
  assert.equal(calls.length, GATE_LANES.length);
  assert.deepEqual(calls.map(({ command }) => command), ["pnpm.cmd", "pnpm.cmd", "pnpm.cmd"]);
  assert.ok(calls.every(({ options }) => options.shell === true && options.stdio === "inherit"));
  assert.deepEqual(calls.map(({ args }) => args), GATE_LANES.map(({ args }) => args));

  for (const child of children) child.emit("close", 0, null);
  const results = await resultPromise;
  assert.equal(results.length, GATE_LANES.length);
  assert.ok(results.every(({ code }) => code === 0));
});

test("runGateLanes keeps POSIX lane execution shell-free", async () => {
  const calls = [];
  const children = [];
  const spawnImpl = (command, args, options) => {
    const child = makeChild();
    calls.push({ command, args, options });
    children.push(child);
    return child;
  };

  const resultPromise = runGateLanes({ platform: "linux", spawnImpl, log: () => {} });
  assert.ok(calls.every(({ command, options }) => command === "pnpm" && options.shell === false));
  for (const child of children) child.emit("close", 0, null);
  await resultPromise;
});

test("runGateLanes remains fail-closed when a lane exits nonzero", async () => {
  const children = [];
  const errors = [];
  const spawnImpl = () => {
    const child = makeChild();
    children.push(child);
    return child;
  };

  const resultPromise = runGateLanes({ platform: "linux", spawnImpl, log: () => {}, errorLog: (message) => errors.push(message) });
  children[0].emit("close", 0, null);
  children[1].emit("close", 7, null);
  children[2].emit("close", 0, null);
  await assert.rejects(resultPromise, /1 merge-gate lane failed/);
  assert.deepEqual(errors, ["[gate-lanes] postgres failed (exit 7)"]);
});

test("runGateLanes treats a spawn error as a failed lane", async () => {
  const children = [];
  const errors = [];
  const spawnImpl = (command, args) => {
    if (args.includes("test:pg-gate")) throw new Error("pnpm unavailable");
    const child = makeChild();
    children.push(child);
    return child;
  };

  const resultPromise = runGateLanes({ spawnImpl, log: () => {}, errorLog: (message) => errors.push(message) });
  children.forEach((child) => child.emit("close", 0, null));
  await assert.rejects(resultPromise, /1 merge-gate lane failed/);
  assert.deepEqual(errors, ["[gate-lanes] postgres failed (pnpm unavailable)"]);
});
