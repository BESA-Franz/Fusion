#!/usr/bin/env node
/*
FNXC:WorkspaceBootstrap 2026-08-11-21:28:
FN-8994 found that a dangling workspace:* dependency or an unglobbed workspace
package stays invisible until a cold pnpm install fails in an isolated worktree.
Scan the root manifest as an importer even though it matches no workspace glob,
while resolving targets only from glob-covered workspace packages.
*/
import { globSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const DEPENDENCY_BLOCKS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const PACKAGE_DIRECTORY_PREFIXES = ["packages/", "plugins/"];
const EXCLUDED_PACKAGE_PATHS = ["**/node_modules/**", "**/dist/**"];

function isWorkspaceProtocol(value) {
  return typeof value === "string" && value.startsWith("workspace:");
}

function isPackageDirectory(filePath) {
  return PACKAGE_DIRECTORY_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

/*
FNXC:WorkspaceBootstrap 2026-08-11-21:41:
FN-8994's validator runs in pretest and the blocking gate, whose supported Node
floor is 22.4. Use this small package-glob matcher instead of node:path.matchesGlob,
which was added after that floor and would make a valid cold bootstrap fail.
*/
export function matchesWorkspaceGlob(directory, workspaceGlob) {
  const pattern = workspaceGlob
    .replaceAll(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${pattern}$`).test(directory);
}

function isGlobMatched(filePath, workspaceGlobs) {
  const directory = dirname(filePath).replaceAll("\\", "/");
  return workspaceGlobs.some((workspaceGlob) => matchesWorkspaceGlob(directory, workspaceGlob));
}

function overrideEntries(manifest) {
  return [manifest?.pnpm?.overrides, manifest?.overrides]
    .filter((overrides) => overrides && typeof overrides === "object")
    .flatMap((overrides) => Object.entries(overrides));
}

/**
 * Validate in-memory manifests so the policy can be tested without repository I/O.
 * Root manifests are consumers only: they are excluded from package-directory
 * coverage and cannot publish a workspace resolution target.
 */
export function validateWorkspacePackageGraph({ manifests = [], workspaceGlobs = [] }) {
  const violations = [];
  const workspaceManifests = manifests.filter(({ filePath, isRoot }) => !isRoot && isGlobMatched(filePath, workspaceGlobs));
  const workspaceNames = new Set(
    workspaceManifests.map(({ manifest }) => manifest?.name).filter((name) => typeof name === "string" && name.trim()),
  );

  for (const { filePath, manifest = {}, isRoot = false } of manifests) {
    if (!isRoot && isPackageDirectory(filePath) && !isGlobMatched(filePath, workspaceGlobs)) {
      violations.push(`${filePath}: package directory is not covered by any pnpm-workspace.yaml packages glob`);
    }

    for (const blockName of DEPENDENCY_BLOCKS) {
      const dependencies = manifest?.[blockName];
      if (!dependencies || typeof dependencies !== "object") continue;
      for (const [packageName, version] of Object.entries(dependencies)) {
        if (isWorkspaceProtocol(version) && !workspaceNames.has(packageName)) {
          violations.push(`${filePath}: ${blockName}.${packageName} uses workspace: but no glob-covered workspace package publishes ${packageName}`);
        }
      }
    }

    for (const [packageName, version] of overrideEntries(manifest)) {
      if (isWorkspaceProtocol(version) && !workspaceNames.has(packageName)) {
        violations.push(`${filePath}: overrides.${packageName} uses workspace: but no glob-covered workspace package publishes ${packageName}`);
      }
    }
  }

  return violations;
}

export function readWorkspacePackageGraph({ root = process.cwd(), readFile = readFileSync, glob = globSync } = {}) {
  let workspaceConfig;
  try {
    workspaceConfig = parseYaml(readFile(`${root}/pnpm-workspace.yaml`, "utf8"));
  } catch (error) {
    return { manifests: [], workspaceGlobs: [], violations: [`pnpm-workspace.yaml: invalid YAML (${error instanceof Error ? error.message : String(error)})`] };
  }
  const workspaceGlobs = Array.isArray(workspaceConfig?.packages) ? workspaceConfig.packages.filter((value) => typeof value === "string") : [];
  const manifestPaths = new Set(["package.json"]);
  for (const workspaceGlob of workspaceGlobs) {
    for (const filePath of glob(`${workspaceGlob}/package.json`, { cwd: root, exclude: EXCLUDED_PACKAGE_PATHS })) manifestPaths.add(filePath);
  }
  for (const filePath of glob("{packages,plugins}/**/package.json", { cwd: root, exclude: EXCLUDED_PACKAGE_PATHS })) manifestPaths.add(filePath);

  const manifests = [];
  const readErrors = [];
  for (const filePath of [...manifestPaths].sort()) {
    try {
      manifests.push({
        filePath,
        isRoot: filePath === "package.json",
        manifest: JSON.parse(readFile(`${root}/${filePath}`, "utf8")),
      });
    } catch (error) {
      readErrors.push(`${filePath}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return { manifests, workspaceGlobs, violations: [...readErrors, ...validateWorkspacePackageGraph({ manifests, workspaceGlobs })] };
}

export function scanWorkspacePackageGraph(options = {}) {
  return readWorkspacePackageGraph(options).violations;
}

export function formatFailureMessage(violations) {
  return [
    "[check-workspace-package-graph] workspace: dependencies must resolve to glob-covered workspace packages.",
    "Every package directory under packages/ or plugins/ must be included by pnpm-workspace.yaml.",
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n");
}

export function main() {
  const violations = scanWorkspacePackageGraph();
  if (!violations.length) return 0;
  console.error(formatFailureMessage(violations));
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
