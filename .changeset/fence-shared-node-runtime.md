---
"@fusion/core": patch
"@fusion/desktop": patch
"@fusion/engine": patch
"@runfusion/fusion": patch
---

summary: Fence shared-database node ownership across runtime startup, dispatch, checkout, and recovery.
category: fix
dev: Runtime leases now use dedicated generations, desktop and CLI startup require the registry-local identity, dispatch preserves locked effective routes, and checkout claims and renewals are fenced against task recovery and moves.
