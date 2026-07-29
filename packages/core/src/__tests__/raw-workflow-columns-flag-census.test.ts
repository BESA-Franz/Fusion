/*
FNXC:WorkflowColumns 2026-07-29-00:00 (U12 — R9):
CENSUS RATCHET for the raw `experimentalFeatures.workflowColumns` compatibility flag.

U12's headline goal is deleting this flag and the settings key behind it. That cannot
happen while anything reads it, and "does anything still read it?" has been answered by
hand three times over the life of the unit — each time by grepping, each time producing
a number nobody can re-derive later. This test makes the answer a fact the suite
maintains.

WHAT THE FLAG IS. `isWorkflowColumnsCompatibilityFlagEnabled` (store.ts) returns
`experimentalFeatures.workflowColumns === true`. It is the RAW key, distinct from the
public runtime helper that treats stale `false` as enabled. No production code writes
the key, so it reads false for every real project — which is why every branch behind it
has been silently inert, and why U12 spent its length finding features that looked
enforced and were not.

WHAT REMAINS, and why it is not mine to remove. Both surviving reads are on the MOVE
PATH and belong to U2b (move-path convergence), which carries an equivalence-proof
obligation because the two implementations it arbitrates have never both run in
production. They are also not separable from each other: the preflight computes the
`movePolicyPreflight` that `moves.ts` consumes and validates, so un-gating it alone
would start evaluating workflow move policies — with their plugin-gate side effects —
while the branch that consumes the result stays off.

THIS TEST FAILS IN BOTH DIRECTIONS, deliberately:
  - a NEW read appears        -> someone is re-gating behaviour on a retired flag;
  - the LAST read disappears  -> U2b has landed, and the settings key can finally go.
The second is the one that matters. It converts "remember to delete the key someday"
into a failing test at the exact moment that becomes possible.
*/
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const SOURCE_ROOTS = ["packages/core/src", "packages/engine/src", "packages/dashboard/src", "packages/cli/src"];

/** The raw-flag reader. Not the always-on public runtime helper. */
const RAW_FLAG_READER = "isWorkflowColumnsCompatibilityFlagEnabled";

/**
 * Every file permitted to reference the raw reader, and why. Paths are repo-relative.
 * `store.ts` declares it; the other two are U2b's move path.
 */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: "packages/core/src/store.ts",
    why: "declares the helper; goes with the last reader",
  },

  {
    file: "packages/core/src/task-store/moves.ts",
    why: "U2b: `useWorkflow` selects between the two move-side-effect implementations",
  },
  {
    file: "packages/core/src/task-store/workflow-task-create-ops.ts",
    why: "U2b: gates the move-policy preflight that moves.ts consumes; not separable from it",
  },
];

/** Strip comments so the many explanatory notes about this flag are not counted as reads. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function collectSourceFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules" || entry === "dist" || entry === "__test-utils__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
}

describe("raw workflowColumns flag census (U12)", () => {
  const files: string[] = [];
  for (const root of SOURCE_ROOTS) collectSourceFiles(join(REPO_ROOT, root), files);

  it("scans a non-trivial production source set, so an empty sweep cannot pass", () => {
    // Without this, a broken path glob would make every assertion below vacuously true —
    // the "guard that reports success without checking anything" failure mode.
    expect(files.length).toBeGreaterThan(200);
  });

  it("the raw flag is read ONLY by the known move-path sites", () => {
    const readers = files
      .filter((file) => stripComments(readFileSync(file, "utf8")).includes(RAW_FLAG_READER))
      .map((file) => file.slice(REPO_ROOT.length + 1))
      .sort();

    const allowed = ALLOWED.map((entry) => entry.file).sort();

    /*
    Equality, not subset. A subset check would let the last reader vanish silently and
    leave the settings key orphaned forever, which is precisely the outcome this exists
    to prevent.

    If this fails because a reader was ADDED: do not extend ALLOWED to make it pass. A
    new read re-gates behaviour on a flag that is false for every real project, so the
    feature behind it will not run.

    If this fails because a reader was REMOVED: U2b has landed. Delete
    `isWorkflowColumnsCompatibilityFlagEnabled`, drop `workflowColumns` from
    `HIDDEN_EXPERIMENTAL_FEATURE_KEYS` in the dashboard SettingsModal only after
    confirming stale persisted values still render nothing, and delete this file.
    */
    expect(readers).toEqual(allowed);
  });

  it("no production code WRITES the key, which is why every read is false in practice", () => {
    /*
    The premise the whole unit rests on, pinned rather than asserted in prose: if a
    writer ever appears, the branches behind the flag stop being uniformly dead and
    every "this is unreachable" conclusion in U12 needs revisiting.
    */
    const writers = files.filter((file) => {
      const code = stripComments(readFileSync(file, "utf8"));
      return /workflowColumns\s*:\s*(true|false)/.test(code);
    }).map((file) => file.slice(REPO_ROOT.length + 1));

    expect(writers).toEqual([]);
  });

  it("records why each remaining reader survives, so the list cannot become folklore", () => {
    // Cheap, but it forces the next person to state a reason when they touch the list.
    for (const entry of ALLOWED) {
      expect(entry.why.length).toBeGreaterThan(20);
      expect(existsSync(join(REPO_ROOT, entry.file))).toBe(true);
    }
  });
});
