---
"@runfusion/fusion": patch
---

summary: Expose shared project memory to isolated task worktrees without copying the Fusion control plane.
category: fix
dev: Fresh, reused, and pooled executor worktrees now receive guarded links for project and agent memory, so generic file tools do not fail on a missing relative .fusion/memory path.
