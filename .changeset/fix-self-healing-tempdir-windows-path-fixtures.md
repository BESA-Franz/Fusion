---
"@runfusion/fusion": patch
---

summary: Make self-healing temp-directory audit fixtures portable across Windows and POSIX paths.
category: fix
dev: Build expected canonical paths with node:path instead of literal POSIX separators.
