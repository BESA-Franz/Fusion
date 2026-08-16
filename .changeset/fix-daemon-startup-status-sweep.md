---
"@runfusion/fusion": patch
"@fusion/engine": patch
---

summary: Keep daemon HTTP readiness independent from slow stale-merge status cleanup.
category: fix
dev: Run stale merging-status cleanup in deferred engine startup work so a slow PostgreSQL lane read cannot hold the daemon on its migration page.
