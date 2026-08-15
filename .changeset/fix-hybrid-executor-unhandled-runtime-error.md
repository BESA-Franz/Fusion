---
"@runfusion/fusion": patch
---

summary: Keep startup-time remote runtime errors from terminating the Fusion daemon.
category: fix
dev: Install a default HybridExecutor error sink so recoverable remote-node startup failures remain observable without requiring an early external listener.
