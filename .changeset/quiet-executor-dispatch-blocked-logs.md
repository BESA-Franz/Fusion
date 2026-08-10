---
"@runfusion/fusion": patch
---

summary: Stop the engine log from repeating "executor dispatch blocked" every poll for a stuck task.
category: fix
dev: The unmet-dependency and ephemeral-disabled pre-dispatch gates now route through `logDispatchBlockedOnce` (packages/engine/src/executor/dispatch-block-log.ts): first block per task/reason logs at `log()`, identical repeats drop to `debug()` (`FUSION_DEBUG=executor`), a changed reason logs again, and the marker clears when the gate passes.
