import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = resolve(REPO_ROOT, "scripts/check-capacity-pool-id.mjs");

test("capacity-pool-id runner enumerates tracked production sources on Windows", () => {
  let output;
  assert.doesNotThrow(() => {
    output = execFileSync(process.execPath, [SCRIPT], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  });
  assert.match(output, /check-capacity-pool-id: ok \(\d+ files inspected\)/);
});
