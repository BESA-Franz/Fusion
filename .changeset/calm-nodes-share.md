---
"@runfusion/fusion": patch
---

summary: Preserve a shared project identity when registering the same repository on another node.
category: fix
dev: POST /api/projects accepts projectId and rejects marker or registry identity conflicts.
