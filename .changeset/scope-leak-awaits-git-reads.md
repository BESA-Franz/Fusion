---
"@runfusion/fusion": patch
---
summary: Keep scope-leak verification fail-closed without orphaning sibling Git reads.
category: fix
dev: Await both per-repository capture operations before returning a failed verification, preventing Windows worktree cleanup races.
