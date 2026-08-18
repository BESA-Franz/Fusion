---
"@runfusion/fusion": patch
---

summary: Preserve dirty or unverified worktrees during automatic cleanup.
category: fix
dev: Pool cleanup now uses non-forced backend removal and deletes unregistered worktree directories only after ownership-aware secret cleanup proves them empty.
