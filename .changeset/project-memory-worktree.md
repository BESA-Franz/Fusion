---
"@runfusion/fusion": patch
---

summary: Keep executor memory reads on the shared project root across task worktrees.
category: fix
dev: File-backed project-memory instructions now provide the absolute root path and forbid creating memory files inside disposable task worktrees.
