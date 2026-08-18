---
"@fusion/engine": patch
---

summary: Prevent forwarded HybridExecutor runtime errors from terminating an otherwise supervised Fusion process.
category: fix
dev: HybridExecutor now installs a permanent secret-free error listener before ProjectManager event forwarding. Optional observers still receive the original typed event, while an early runtime error can no longer trigger Node's unhandled error-event crash behavior.
