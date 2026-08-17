---
"@runfusion/fusion": patch
---

summary: Make Windows verify-fast and boot smoke use isolated process boundaries.
category: fix
dev: Route pnpm shims through the watchdog shell only on Windows and isolate CLI help from ambient database state.
