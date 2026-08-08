---
"@fusion/core": patch
"@fusion/engine": patch
"@runfusion/fusion": patch
---

summary: Archive cleanup now respects node-local worktree ownership.
category: fix
dev: Both baseline and live-executor archive disposal skip remote-node paths, the current node's project-path mapping replaces foreign canonical paths before local Git verification, and skipped workspace reservations are released without quarantining healthy remote worktrees.
