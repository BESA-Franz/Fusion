---
"@runfusion/fusion": patch
---

summary: Keep worktree-liveness audit expectations portable across path separators.
category: fix
dev: Derive the expected worktree root with the same path resolver used by the executor.
