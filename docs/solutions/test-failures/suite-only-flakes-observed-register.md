---
category: test-failures
module: testing
date: 2026-08-01
problem_type: suite_only_flake
component: PostgreSQL test infrastructure
severity: medium
applies_when:
  - "A test fails under full-suite parallelism but passes when run alone"
  - "A first flake sighting is in a file whose remaining coverage is substantial"
  - "Capturing evidence before a file-level quarantine decision"
  - "A merge-gate canary is evicted from the blocking gate after a flake sighting"
tags:
  - flake
  - postgres
  - full-suite
  - quarantine
---

# Observed suite-only flakes register

This register preserves first-sighting evidence under the narrow exception in [AGENTS.md](../../../AGENTS.md#standing-rule-flaky-tests-are-quarantined-on-sight-deletion-ratchet), and merge-gate eviction records. An eviction record documents a gate flake removed from the blocking canary list while coverage continues in the non-blocking lane. It is not a quarantine: the normal default remains a ledger entry plus matching Vitest `exclude` in the same commit.

## 1. Project identity returns no stored identity

- **File:** `packages/core/src/__tests__/postgres/project-identity.test.ts`
- **Exact test:** `project-identity async (PostgreSQL integration) > returns null when no identity is stored`
- **Observed tree/SHA:** `origin/main` at `7927c7b58a`
- **Observed frequency:** 1-in-3 full-core-suite runs.

| run | result |
|---|---|
| full core suite (1st) | **1 failed** / 4824 passed |
| full core suite (2nd) | 4825 passed |
| full core suite (3rd) | 4825 passed |
| file alone ×2 | 6 passed, 6 passed |

## 2. Schema applier retains registered dependents

- **File:** `packages/core/src/__tests__/postgres/schema-applier.test.ts`
- **Exact test:** `schema-applier: VAL-SCHEMA-001 final-schema parity (table counts) > retains unreplaced registered dependents for every delete action`
- **Observed tree/SHA:** PR [#2828](https://github.com/Runfusion/Fusion/pull/2828) merged-with-main.

| run | result |
|---|---|
| full core suite on #2828 merged-with-main | **failed** |
| file alone ×2 on the same tree | 75 passed, 75 passed |
| file alone on `origin/main` | passed |

## 3. Plugin runner complete-lane lifecycle hook

- **File:** `packages/engine/src/__tests__/plugin-runner.test.ts`
- **Exact test:** `PluginRunner > task lifecycle hooks > should invoke onTaskCompleted when the complete lane is RENAMED`
- **Observed tree/SHA:** PR [#2799](https://github.com/Runfusion/Fusion/pull/2799) merged-with-main.

| run | result |
|---|---|
| full engine suite on #2799 merged-with-main (1st) | **8 failed** (7 in this file + 1 inherited) |
| full engine suite, same tree (2nd) | 1 failed (the inherited one only) |
| file alone | 80 passed |
| full engine suite on `origin/main` ×2 | clean |

Seven tests failed in `plugin-runner.test.ts`, but only this one identity survived capture: `--reporter=dot | tail -3` truncated the `FAIL` lines and retained only the summary.

## 4. Planning Mode direct task handoff

- **File:** `packages/dashboard/app/components/__tests__/PlanningModeModal.planning-flow.test.tsx`
- **Exact test:** `PlanningModeModal sequential flow > creates the task directly and offers task and session-list handoffs`
- **Observed tree/SHA:** `4e21f53996` (FN-8757 worktree)
- **Observed frequency:** first observation in the targeted file run.

| run | result |
|---|---|
| targeted file run | **1 failed** / 56 passed; `mockCreateTaskFromPlanning` was not called and jsdom reported unimplemented `window.scrollTo()` |
| isolated exact test | passed |

The failure is unrelated to the mobile question footer: it exercises the completed-plan Proceed handoff, while FN-8757 changes only the active-question footer. The file retains substantial coverage, so this first sighting is recorded rather than quarantined; a second sighting requires the normal file-level quarantine.

**Superseded 2026-08-10 (FN-8936):** The second sighting moved the file to the deletion-ratchet ledger. Investigation classified the direct handoff as a detached test-node hydration race, not a product create-state race; the suite was rescued by settling hydration and re-querying the live Proceed action before every previously unsafe direct click. The ledger and Vitest exclusion were removed together after exact and loaded-file proof, without timeout/retry/assertion appeasement.

## 5. Planning Mode mobile plan-tab selection

- **File:** `packages/dashboard/app/components/__tests__/PlanningModeModal.planning-flow.test.tsx`
- **Exact test:** `PlanningModeModal sequential flow > uses full-view Questions and Plan preview tabs on mobile`
- **Observed tree/SHA:** `main` at `4ff41a723c` with the Planning Mode task-creation fix uncommitted.
- **Observed frequency:** first observation in a targeted three-file dashboard run.

| run | result |
|---|---|
| targeted three-file dashboard run | **1 failed** / 198 passed; React reported an update outside `act(...)`, and the Plan tab still had `aria-selected="false"` immediately after `fireEvent.click` |

The failure exercises the pre-existing mobile tab transition, while the task-creation fix changes the completed-plan Proceed handoff. The file retains substantial coverage, so this first sighting is recorded rather than quarantined; a second sighting requires the normal file-level quarantine.

**Suite re-admitted 2026-08-10 (FN-8936):** This first-sighting mobile observation did not receive a second failure. The shared file-level quarantine was removed only after the direct-handoff root cause was structurally fixed and the unexcluded loaded suite, including this mobile coverage, passed.

## Common shape and unverified suspicion

Entries 1–3 are PostgreSQL-backed or PostgreSQL-suite-adjacent, pass in isolation, and appeared only under full-suite parallelism. This points at shared database state between those test files rather than any one test. It is **unverified and uninvestigated**, not a diagnosis; do not infer a root-cause fix from this record. Entry 6 instead records a merge-gate eviction after a loaded-lane setup-hook timeout; `FNXC:PgTestTemplateDb 2026-07-19-17:20` and `FNXC:PgTestWorkerCap 2026-07-18-18:00` are already-landed mitigations for that mode, not new diagnoses to re-open. The Planning Mode entries are separate frontend timing observations.

## Policy and escalation

Quarantine is file-level, while the first-sighting exception preserves coverage in files retaining 6 / 75 / 80 passing tests. Under that exception, recording preserves valuable coverage. A **second sighting** of a registered test is an on-sight quarantine: add it to `scripts/lib/test-quarantine.json` and the matching Vitest `exclude` in one lockstep commit; this register entry is then evidence for the ledger `reason`.

Merge-gate eviction records follow a separate branch: the gate can no longer be reddened by that file, while the non-blocking suite retains coverage. A further failure there is an ordinary on-sight quarantine. For PostgreSQL files, the gate-policy assertion forbidding a core-config quarantine exclude makes that an owner decision escalated as its own task rather than an inline edit.

Capture **full runner output** before recording or quarantining a failure—for example, tee it to a file. Never pipe a dot reporter through `tail`: the summary survives while the `FAIL` identity lines needed for a quarantine entry are exactly what gets truncated.

Source: [Runfusion/Fusion issue #2862](https://github.com/Runfusion/Fusion/issues/2862).

## 6. Sync workflow IR default canary setup hook

- **File:** `packages/core/src/__tests__/postgres/sync-workflow-ir-is-always-default.pg.test.ts`
- **Exact test:** `resolveTaskWorkflowIrSync ignores a task's real workflow (PostgreSQL)` suite `beforeAll` setup hook.
- **Observed tree/SHA:** FN-8912 evidence; local confirmation tree `51437558ac352dad3481e0dbe9622fa51af4c599`.
- **Observed frequency:** 1 observed merge-gate sighting in FN-8912; not reproduced locally. This is an **evicted merge-gate canary**, not a first-sighting register exception.

| run | result |
|---|---|
| FN-8912 loaded `pnpm test:gate` | **setup hook timed out** at the inherited 15s budget; direct scoped rerun passed |
| shape A: capped `test:pg-gate` ×5 | 3 files / 13 tests passed each run |
| shape B: isolated target ×3 | 1 file / 3 tests passed each run |
| shape C: uncapped default-config PostgreSQL directory ×5 | 153 files / 1263 passed plus 1 skipped each run |

FN-8928 evicted the file from the blocking gate under the AGENTS.md gate rule; default-core discovery preserves its regression coverage. Shape C was clean, so no quarantine escalation was required. A later non-blocking-core failure is an ordinary on-sight quarantine decision. `FNXC:PgTestTemplateDb 2026-07-19-17:20` (run-shared golden template) and `FNXC:PgTestWorkerCap 2026-07-18-18:00` (four-fork PG-gate cap) are already-landed mitigations for this same 15s setup-hook timeout mode.

## 7. Mission store PostgreSQL teardown hook

- **File:** `packages/core/src/__tests__/postgres/mission-store.pg.test.ts`
- **Exact test:** `MissionStore (PostgreSQL backend mode)` suite `afterAll` hook (`h.afterAll`).
- **Observed tree/SHA:** `32f677bbc207e421fd260ae2ba22fcefeeef4d86` (FN-8979 worktree).
- **Observed frequency:** first observation in a direct targeted rerun; 61 tests in the file passed.

| run | result |
|---|---|
| targeted file with `--silent=passed-only` | passed (exit 0) |
| targeted file with dot reporter | **afterAll hook timed out** at 15s; 61 tests passed |

The timeout occurred after all test assertions and is unrelated to FN-8979's canonical mission-blocker contract. This file retains substantial coverage, so this first observation is recorded rather than quarantined. A second sighting requires the normal file-level quarantine decision.

## 8. Planning Mode duplicate-response generation reconciliation

- **File:** `packages/dashboard/app/components/__tests__/PlanningModeModal.planning-flow.test.tsx`
- **Exact test:** `PlanningModeModal sequential flow > silently reconciles duplicate-response generation conflicts on $viewport with $label`

<!-- FNXC:TestFlakeRegister 2026-08-16-10:52: Parametrized `it.each` cases are registered by their source-template title because the register validator checks raw test-file hierarchy segments. The concrete failing `'mobile'` row (`a durable next question`) and earlier contaminated `'desktop'` row remain recorded below as evidence. -->
- **Observed tree/SHA:** `main` at `8ee2ace2c1` (dashboard bare-run repair batch).
- **Observed frequency:** one clean sighting — solo standard-lane run (`node scripts/run-quality-tests.mjs`, lane `app:backfill-3`) on a quiet machine; the earlier `'desktop'`-row failure ran concurrently with a full bare vitest run and live peer-session edits to planning API files, so it is recorded as context, not as an independent clean sighting.

| run | result |
|---|---|
| solo standard lane (quiet machine) | **1 failed** (`'mobile'` row) / rest of lane passed |
| targeted file run immediately after | 58/58 passed |
| earlier busy-machine standard lane | **1 failed** (`'desktop'` row); targeted rerun 58/58 passed |

This file now carries THREE distinct register/ledger histories (entries 4 and 5 above plus this one) and one prior FN-8936 stabilization. Under the AGENTS.md repeated-quarantine rule this is a subsystem product-race smell: the duplicate-response generation reconciliation path (FN-8756 banner suppression / duplicate-generation dedup) should be investigated as a product race rather than stabilized a fourth time. Filed as a Fusion task; a second clean sighting of this exact test is an ordinary on-sight quarantine.

**Resolved 2026-08-16 (FN-9116): Product race.** `handleSubmitResponse` caught a duplicate response-generation rejection, awaited `fetchAiSession(sessionId)`, then wrote its old session snapshot after a newer writer could already own the UI. The fix captures the response load and turn epochs before the response await, so an A → B → A reload cannot let the old A response adopt the new A load epoch. Every reconciliation/fallback write drops when a newer load, response, stream event, or recovery transition owns the view.

Crucially, an accepted SSE `onError` is a turn boundary only after stale-event rejection. Its recovery captures that turn token across fetch and auto-retry awaits; a later response cannot be overwritten by an old reconnect, retry failure, or permanent error, and reconciliation from the errored turn cannot overwrite the recovery. The loading-poll error path now also claims its recovery turn *before* auto-retry: a successful retry returns early, so claiming afterward had left a held reconciliation authorized to overwrite recovery loading state.

FN-9116 adds deterministic ordering coverage for desktop and mobile rows across durable-question, result-only plan-review, generating snapshots, A → B → A reload/rejection, `onError`-before-reconciliation, `onError` recovery losing ownership to a later response, and loading-poll recovery landing before a held reconciliation. The non-duplicate actionable-error assertions remain intact and passing. Response actions now settle hydration and query the live control before dispatch, removing the detached hydration-node test seam without changing product semantics.

- **Resolved tree/SHA:** `d5f29bbdbc` (FN-9116 worktree; final documentation commit follows).

| verification | result |
|---|---|
| targeted planning-flow file ×3 | **passed** (76 tests each run) |
| shared-helper sibling suites ×1 | **passed** |
| `app:backfill-3` run 1 | **passed** (5,693 tests) |
| `app:backfill-3` run 2 | **passed** (5,693 tests) |
| `app:backfill-3` run 3 | **passed** (5,693 tests) |
| `pnpm lint`, `pnpm verify:fast`, `pnpm build` | **passed** |

The flake is structurally removed rather than stabilized: every hydration/recovery writer now has an ownership boundary before it can overwrite a newer turn. This is a published behavior fix, so FN-9116 includes a patch changeset.

## 9. Create Room picker loaded-lane state ordering

- **File:** `packages/dashboard/app/components/__tests__/CreateRoomModal.test.tsx`
- **Exact test:** `CreateRoomModal > shows loading, empty, no-match, populated, and selected-member picker states`
- **Observed tree/SHA:** `7527d2651f` (FN-9120 baseline).
- **Observed frequency:** 2/2 loaded `dashboard-app-quality-backfill` shard-2 runs failed; a targeted rerun had passed before this investigation.

| run | result |
|---|---|
| loaded backfill shard 2 | **failed** — 1 failed / 2,134 passed; full output retained |
| loaded backfill shard 2 with picker instrumentation | **failed** — same assertion; fetch calls were exactly 1/2/3 and the member list still rendered Alpha/Beta after typing `zzz` |
| new ordering tests against unfixed component | **failed** — stale project result overwrote current roster; rejected load rendered no-agents copy |

**Resolved 2026-08-16 (FN-9120): both a timing-sensitive test assertion and a product race.** The original third phase synchronously asserted after `userEvent.type` while the loaded lane still rendered populated rows, even though its once queue had not shifted. Independently, the production effect had no cleanup or request identity, so a close/reopen, project change, or unmount could let a stale fetch write roster/loading/error state; initial `loadingAgents=false` also exposed terminal empty copy before the first effect.

The component now owns an explicit idle/loading/loaded/failed phase and fences each request with an epoch plus cleanup. A current successful reload removes selected IDs absent from its roster. The test uses controlled deferred promises in a single persistently-mounted modal, proves close/reopen/project ordering, failure and unmount fencing, duplicate-name/selection reconciliation, and desktop/mobile empty-state copy invariants without retries, sleeps, waits around the old assertion, or mock re-pinning.

## 10. Planning Mode loaded-turn affordance ownership

- **Files:** `packages/dashboard/app/components/__tests__/PlanningModeModal.planning-flow.test.tsx`, `PlanningModeModal.ui-interactions.test.tsx`
- **Exact cases:** `opens Plan preview without submitting and preserves the current mobile answer on return`; `can restart initial planning after stopping its first generation`; `can refine a stopped initial plan into the first question`; both desktop/mobile rows of `keeps five substantive choices and one Other usable on %s`; `submits an answer after deferred same-session hydration on %s`; and FN-9117's `keeps post-Stop plan review when a pre-Stop loading poll resolves on %s`.
- **Observed tree/SHA:** original reports at `9a9e591b72`; completed remediation tree `603373b93a`.

**Resolved 2026-08-16 (FN-9117): Product ownership race, not a timeout defect.** `QuestionForm` rendered from `workspaceQuestion`, while submit formerly branched on a closed-over `view`; a late hydration could therefore drop an enabled Next action. It also restored every new `initialResponse` object identity, overwriting a dirty same-question draft and disabling the mobile Next-question path. FN-9117 binds submit to the live session/question state and preserves a dirty same-question draft.

The Stop audit also confirmed the recovery-poll ownership hazard: Stop invalidates loading state then can restore the same session id for a question or summary terminal view. FN-9116's load-and-turn fence now rejects a poll started before that boundary. FN-9117 adds real-modal desktop and mobile deferred-poll coverage: fake timer time starts the 8-second poll, a deferred stale durable question resolves after Stop, and post-Stop plan review remains intact. The pre-FN-9116 source had effect-cleanup cancellation once terminal React state committed; the epoch fence closes the earlier render/cleanup interval structurally. No timeout, retry, widened wait, sleep, weakened assertion, or quarantine was used.

This completes the two Stop reports rather than deferring them as unreproduced. A same-session `ai_session:updated` rehydrate was the remaining transient-unmount path: `loadSession` cleared `workspaceQuestion` before its fetch resolved, unmounting `QuestionForm` and discarding the dirty answer. It now preserves an active question/plan-review workspace only for a refresh of that same session; a different session still enters the neutral loader. The real-modal deferred-hydration test uses per-character `userEvent.type` on desktop and the mobile Other choice, then asserts the exact `respondToPlanning` payload after the controlled commit.

It is the companion to entries 4, 5, and 8: FN-8936 fixed detached test-node handoff; FN-9116 fences duplicate-response and recovery writers; FN-9117 ensures visible question controls use the live turn and retain operator drafts.

| verification | result |
|---|---|
| targeted planning-flow + ui-interactions ×3 | **passed** (84 planning-flow tests, 20 UI-interaction tests) |
| all `PlanningModeModal.*` sibling suites | **passed** |
| `test:quality:app:backfill` aggregate attempt | shards 1–3 passed; initial 300s bound ended during shard 4, which passed when run directly |
| `test:quality:app:backfill` aggregate attempts 2–3 | blocked by repeated unrelated `CreateRoomModal` search-state failures; filed as FN-9121 with full logs `/tmp/fn-9117-backfill-run-{2,3}.log` |
| `pnpm lint`, `pnpm verify:fast`, `pnpm build` | **passed** |

No UI surface changed; this was a state-ownership and regression-coverage repair. The existing patch changeset remains applicable because Planning Mode behavior is user-visible.
