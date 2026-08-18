---
"@runfusion/fusion": patch
---

summary: Restore executor worktree Git operations on Windows.
category: fix
dev: Dependency imports and worktree remote refresh now use cmd-compatible argument quoting on Windows while retaining POSIX quoting on Unix.
