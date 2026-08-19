import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verifyWindowsRuntimePackage } from "../verify-windows-runtime-package.mjs";

function runtimeFixture({ includeDependency }) {
  const root = mkdtempSync(join(tmpdir(), "fusion-runtime-package-"));
  mkdirSync(join(root, "dist", "client"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0", type: "module", dependencies: { typescript: "1.0.0" } }));
  writeFileSync(join(root, "dist", "client", "version.json"), JSON.stringify({ version: "fixture-build" }));
  writeFileSync(join(root, "bin.mjs"), 'import "typescript"; process.stdout.write("fixture help\\n");\n');
  if (includeDependency) {
    const dependencyRoot = join(root, "node_modules", "typescript");
    mkdirSync(dependencyRoot, { recursive: true });
    writeFileSync(join(dependencyRoot, "package.json"), JSON.stringify({ name: "typescript", version: "1.0.0", type: "module", exports: "./index.js" }));
    writeFileSync(join(dependencyRoot, "index.js"), "export {};\n");
  }
  return root;
}

test("rejects the exact PC3 failure when a production dependency is absent", () => {
  const root = runtimeFixture({ includeDependency: false });
  try {
    assert.throws(() => verifyWindowsRuntimePackage(root, "fixture-build"), /production dependencies are missing: typescript/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a self-contained runtime only after its isolated boot smoke passes", () => {
  const root = runtimeFixture({ includeDependency: true });
  try {
    assert.deepEqual(verifyWindowsRuntimePackage(root, "fixture-build"), {
      build: "fixture-build",
      packageVersion: "1.0.0",
      productionDependencyCount: 1,
      bootSmoke: "passed",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
