---
"@runfusion/fusion": patch
---

summary: Keep worktree backend path contracts portable across host platforms.
category: fix
dev: Assert stale-lock and resolved worktree paths through native path resolution instead of Linux-only literals.
