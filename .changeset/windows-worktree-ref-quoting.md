---
"@runfusion/fusion": patch
---

summary: Keep worktree base refresh and branch collision recovery functional on Windows.
category: fix
dev: Git refs now use cmd-compatible quoting on Windows while retaining strict POSIX shell quoting on Unix.
