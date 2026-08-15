---
"@runfusion/fusion": patch
---

summary: Keep hook-script permission tests portable on Windows filesystems.
category: fix
dev: Assert POSIX execute bits only on hosts that represent them while retaining script existence and content checks everywhere.
