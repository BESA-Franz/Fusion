---
"@runfusion/fusion": patch
---

summary: Repair missing GitHub check-state tables and preserve pnpm workspace links in production Docker builds.
category: fix
dev: Prevents CI-state and self-healing loops after a partial database restore or schema drift, and makes the image builder link dependencies after source copy.
