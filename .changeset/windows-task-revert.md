---
"@runfusion/fusion": patch
---

summary: Restore task revert operations on Windows.
category: fix
dev: Task revert now uses cmd-compatible quoting for refs, SHAs, ranges, branches, and commit messages while retaining POSIX quoting on Unix.
