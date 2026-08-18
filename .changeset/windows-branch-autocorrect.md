---
"@runfusion/fusion": patch
---

summary: Restore existing-branch autocorrection on Windows.
category: fix
dev: Branch autocorrect now uses cmd-compatible Git ref quoting on Windows while retaining POSIX quoting on Unix.
