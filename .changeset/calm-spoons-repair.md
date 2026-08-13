---
"@runfusion/fusion": patch
---

summary: Repair a missing GitHub check-state table even when PostgreSQL migration bookkeeping already contains version 0048.
category: fix
dev: Prevents CI-state and self-healing loops after a partial database restore or schema drift.
