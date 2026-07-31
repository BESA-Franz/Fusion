---
"@runfusion/fusion": patch
---

summary: Prevent multi-node startup from running duplicate local project planners.
category: fix
dev: CLI ProjectEngineManager owns local projects; HybridExecutor now loads only explicit remote assignments.
