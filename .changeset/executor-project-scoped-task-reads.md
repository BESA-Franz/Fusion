---
"@fusion/engine": patch
"@runfusion/fusion": patch
---

summary: Executor task reads stay bound to the owning project store on every node.
category: fix
dev: Executor sessions no longer load cwd-resolved host extensions. Their task list, show, and search tools use the engine's project-scoped store, preventing duplicate local project partitions from hiding centrally routed tasks.
