---
"@runfusion/fusion": patch
---

summary: Keep self-healing agent-link sweeps running when a linked task is deleted or missing.
category: fix
dev: Task-gone lookup races are treated as stale links, while unrelated lookup failures stay isolated to the affected candidate.
