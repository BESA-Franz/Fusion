---
"@fusion/core": patch
"@fusion/engine": patch
"@runfusion/fusion": patch
---

summary: Assigned work in shared-PostgreSQL deployments now runs only on its selected Fusion node.
category: fix
dev: Adds fail-closed `FUSION_NODE_ID` process identity, scheduler ownership gates before node-local preflight in both dispatch paths, triage-planner ownership checks, concrete winner persistence for unpinned work, and executor/continuation defense-in-depth checks.
