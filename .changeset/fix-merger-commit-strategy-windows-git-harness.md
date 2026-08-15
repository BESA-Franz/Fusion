---
"@runfusion/fusion": patch
---

summary: Make direct-merge attribution and its real-Git fixture safe on Windows shells.
category: fix
dev: Quote attribution refs for the active shell, pass fixture Git arguments directly, and use Node filesystem operations for portable setup.
