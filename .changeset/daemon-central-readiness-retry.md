---
"@runfusion/fusion": patch
---

summary: Retry daemon startup cleanly when the central PostgreSQL backend is temporarily unavailable.
category: fix
dev: Preserve the original initialization error and stop startup before project access or server binding.
