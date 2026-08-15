---
"@runfusion/fusion": patch
---

summary: Keep graph missing-worktree recovery tests aligned with extracted failure seams and Windows paths.
category: fix
dev: Call the exported graph-failure resolver directly and normalize the reacquired path only for its platform-neutral assertion.
