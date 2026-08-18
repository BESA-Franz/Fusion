---
"@fusion/dashboard": patch
---

summary: Bind health responses to the running build, node, project, and database migration version.
category: fix
dev: The public health payload now includes the secret-free FUSION_BUILD_VERSION, explicitly configured FUSION_NODE_ID, launch project id, and registered PostgreSQL schema baseline so local activation gates can verify the exact runtime mapping without exposing hostname-derived fallback identities.
