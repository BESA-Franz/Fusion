import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import fg from "fast-glob";
import { parse } from "yaml";

const workflowPath = new URL("../../.github/workflows/test-release.yml", import.meta.url);
const workspaceRoot = new URL("../../", import.meta.url);
const workspaceRootPath = fileURLToPath(workspaceRoot);
const source = readFileSync(workflowPath, "utf8");
const workflow = parse(source);
const packageManifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

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
  assert.doesNotMatch(commands, /pnpm typecheck(?:\s|$)/);
  assert.equal((commands.match(/pnpm build:full/g) ?? []).length, 1);
  assert.equal((commands.match(/pnpm typecheck:runtime-residual/g) ?? []).length, 1);
  assert.ok(commands.indexOf("pnpm build:full") < commands.indexOf("pnpm typecheck:runtime-residual"));
  assert.match(commands, /fusion-runtime-build-authorization/);
  assert.match(commands, /schemaVersion = 1/);
  assert.match(commands, /artifactSha256 = \$artifactSha/);
  assert.match(commands, /sourceCommit = \$env:FUSION_RUNTIME_COMMIT/);
  assert.match(commands, /schemaBaselineVersion = '0060'/);
  assert.match(commands, /durationMs = \$overallDurationMs/);
  assert.match(commands, /stages = \[ordered\]@\{/);
  assert.match(commands, /workspaceBuild = \[ordered\]@\{ restored = \$false; skippedPackages = 0 \}/);
  assert.match(commands, /secretsRecorded = \$false/);
  assert.match(commands, /Get-FileHash -LiteralPath \$receiptPath -Algorithm SHA256/);
});

/*
FNXC:RuntimeAuthorization 2026-08-18-20:38:
The full runtime build already compiles every build-bearing workspace. The residual gate must
typecheck only the CLI bundle entrypoint, dashboard browser program, and raw-source packages
that the runtime stages without a package build, so authorization never repeats the full
workspace typecheck after the single release build.
*/
test("runtime residual typecheck covers only build gaps", () => {
  const residualCommand = packageManifest.scripts?.["typecheck:runtime-residual"];
  assert.equal(
    residualCommand,
    "pnpm --filter @runfusion/fusion --filter @fusion/droid-cli --filter @fusion/i18n --filter @fusion/pi-claude-cli --filter @fusion/pi-llama-cpp typecheck && pnpm --filter @fusion/dashboard exec tsc --noEmit -p tsconfig.app.json",
  );

  const rawSourcePackages = fg
    .sync(["packages/*/package.json", "plugins/*/package.json", "plugins/examples/*/package.json"], {
      cwd: workspaceRootPath,
      onlyFiles: true,
    })
    .map((manifestPath) => JSON.parse(readFileSync(new URL(manifestPath, workspaceRoot), "utf8")))
    .filter(
      (manifest) =>
        typeof manifest.scripts?.typecheck === "string" &&
        typeof manifest.scripts?.build !== "string" &&
        !["@fusion/desktop", "@fusion/mobile"].includes(manifest.name),
    );

  for (const manifest of rawSourcePackages) {
    assert.match(residualCommand, new RegExp(`--filter ${manifest.name.replace("/", "\\/")}(?:\\s|$)`));
  }
});
