---
"@runfusion/fusion": patch
---

summary: Avoid false remote-worker errors during slow authenticated health responses.
category: fix
dev: Allows ten seconds for Tailnet node health checks while keeping the probe below the one-minute monitor cadence.
