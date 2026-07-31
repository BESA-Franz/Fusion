---
"@fusion/core": patch
"@fusion/dashboard": patch
"@runfusion/fusion": patch
---

summary: Supervised daemon nodes can restart through the authenticated system API.
category: fix
dev: Shares live-parent supervision detection between dashboard and daemon runtimes, verifies the stamped parent PID still exists on Windows, rechecks supervision before auto-update installation, exposes daemon system control only with a verified parent, and exits with the existing restart contract code after graceful shutdown.
