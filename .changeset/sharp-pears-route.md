---
"@fusion/core": patch
"@fusion/engine": patch
"@runfusion/fusion": patch
---

summary: Assigned work in shared-PostgreSQL deployments now runs only on its selected Fusion node.
category: fix
dev: Adds fail-closed `FUSION_NODE_ID` process identity, scheduler ownership gates in both dispatch paths, concrete winner persistence for unpinned work, and executor/continuation defense-in-depth checks.
