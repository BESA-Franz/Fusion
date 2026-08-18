import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";

const workflowPath = new URL("../../.github/workflows/test-release.yml", import.meta.url);
const source = readFileSync(workflowPath, "utf8");
const workflow = parse(source);

test("authorized Windows runtime is an isolated manual release lane", () => {
  const dispatch = workflow.on?.workflow_dispatch;
  assert.equal(dispatch?.inputs?.authorized_windows_runtime_only?.type, "boolean");
  assert.equal(dispatch?.inputs?.authorized_windows_runtime_only?.default, false);

  const runtimeJob = workflow.jobs?.["build-authorized-windows-runtime"];
  assert.equal(runtimeJob?.["runs-on"], "windows-latest");
  assert.match(runtimeJob?.if ?? "", /authorized_windows_runtime_only\s*==\s*true/);

  for (const jobName of [
    "build-binaries",
    "build-desktop-windows",
    "build-desktop-macos",
    "build-desktop-linux",
    "build-android",
    "collect",
  ]) {
    assert.match(workflow.jobs?.[jobName]?.if ?? "", /authorized_windows_runtime_only\s*!=\s*true/);
  }
});

test("runtime authorization binds the exact artifact, commit, fix proof, and schema", () => {
  const runtimeJob = workflow.jobs?.["build-authorized-windows-runtime"];
  const steps = runtimeJob?.steps ?? [];
  const commands = steps.map((step) => step.run ?? "").join("\n");

  assert.match(commands, /git status --porcelain --untracked-files=all/);
  assert.match(commands, /hybrid-executor\.test\.ts/);
  assert.match(commands, /schema-applier\.test\.ts/);
  assert.match(commands, /pnpm typecheck/);
  assert.equal((commands.match(/pnpm build:full/g) ?? []).length, 1);
  assert.match(commands, /fusion-runtime-build-authorization/);
  assert.match(commands, /artifactSha256 = \$artifactSha/);
  assert.match(commands, /sourceCommit = \$env:FUSION_RUNTIME_COMMIT/);
  assert.match(commands, /schemaBaselineVersion = '0060'/);
  assert.match(commands, /secretsRecorded = \$false/);
  assert.match(commands, /Get-FileHash -LiteralPath \$receiptPath -Algorithm SHA256/);
});
