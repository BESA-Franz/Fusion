---
"@runfusion/fusion": patch
---

summary: Honor an explicitly configured Fusion runtime node when resolving project paths.
category: fix
dev: `FUSION_NODE_ID` now selects the runtime node in shared PostgreSQL registries and fails closed when the node is absent.
