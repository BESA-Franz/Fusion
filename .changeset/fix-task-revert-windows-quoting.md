---
"@runfusion/fusion": patch
---

summary: Make task-revert Git operations portable on Windows.
category: fix
dev: Pass commit revisions and shell arguments without POSIX-only quoting so revert classification and PR-branch preparation preserve Git refs on Windows.
