---
"@runfusion/fusion": patch
---

summary: Preserve task ownership when foreign-only branch deletion fails.
category: fix
dev: Foreign-only recovery now uses cmd-compatible branch quoting on Windows and clears task ownership only after confirmed deletion.
