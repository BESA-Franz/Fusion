---
"@runfusion/fusion": patch
---

summary: Keep soft-deleted planning snapshots from aborting self-healing sweeps.
category: fix
dev: Skip archived task snapshots that cannot be mutated and isolate per-task recovery errors so other planning segments continue to finalize.
