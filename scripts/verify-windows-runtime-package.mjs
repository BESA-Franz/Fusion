import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BUILD_PATTERN = /^[A-Za-z0-9._-]+$/;

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is missing or invalid: ${path}`);
  }
}

function dependencyManifestPath(runtimeRoot, dependencyName) {
  return resolve(runtimeRoot, "node_modules", ...dependencyName.split("/"), "package.json");
}

function safeProcessOutput(value) {
  return String(value ?? "")
    .replace(/(password|token|secret|authorization)(\s*[=:]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/:\/\/[^@\s]+@/g, "://[REDACTED]@")
    .slice(-4000);
}

/*
FNXC:RuntimeAuthorization 2026-08-19-05:06:
The authorized Windows ZIP is an immutable deployment unit. Verify every declared production
dependency inside the extracted artifact and boot its real CLI entrypoint from that isolated
directory so an inherited workspace or previous-runtime node_modules cannot mask omissions.
*/
export function verifyWindowsRuntimePackage(runtimeRootInput, expectedBuild) {
  if (!isAbsolute(runtimeRootInput)) throw new Error("Runtime root must be absolute.");
  const runtimeRoot = resolve(runtimeRootInput);
  if (!BUILD_PATTERN.test(expectedBuild)) throw new Error("Expected build is invalid.");

  const packagePath = resolve(runtimeRoot, "package.json");
  const entrypointPath = resolve(runtimeRoot, "bin.mjs");
  const versionPath = resolve(runtimeRoot, "dist", "client", "version.json");
  const manifest = readJson(packagePath, "Runtime package manifest");
  const version = readJson(versionPath, "Runtime build identity");

  if (!existsSync(entrypointPath)) throw new Error(`Runtime entrypoint is missing: ${entrypointPath}`);
  if (version.version !== expectedBuild) {
    throw new Error(`Runtime build identity mismatch: ${String(version.version)} != ${expectedBuild}`);
  }

  const missingDependencies = Object.keys(manifest.dependencies ?? {})
    .sort()
    .filter((dependencyName) => !existsSync(dependencyManifestPath(runtimeRoot, dependencyName)));
  if (missingDependencies.length > 0) {
    throw new Error(`Runtime production dependencies are missing: ${missingDependencies.join(", ")}`);
  }

  const smoke = spawnSync(process.execPath, [entrypointPath, "--help"], {
    cwd: runtimeRoot,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  if (smoke.error) throw new Error(`Runtime boot smoke could not execute: ${smoke.error.code ?? smoke.error.name}`);
  if (smoke.status !== 0) {
    throw new Error(`Runtime boot smoke failed with exit ${String(smoke.status)}: ${safeProcessOutput(smoke.stderr || smoke.stdout)}`);
  }

  return {
    build: expectedBuild,
    packageVersion: String(manifest.version ?? ""),
    productionDependencyCount: Object.keys(manifest.dependencies ?? {}).length,
    bootSmoke: "passed",
  };
}

function parseCli(argv) {
  if (argv.length !== 3 || argv[1] !== "--expected-build") {
    throw new Error("Usage: node scripts/verify-windows-runtime-package.mjs <runtime-root> --expected-build <build>");
  }
  return { runtimeRoot: argv[0], expectedBuild: argv[2] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseCli(process.argv.slice(2));
    const result = verifyWindowsRuntimePackage(options.runtimeRoot, options.expectedBuild);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
