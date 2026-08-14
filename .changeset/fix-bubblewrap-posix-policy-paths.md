---
"@runfusion/fusion": patch
---

summary: Keep Bubblewrap mount policies bound to Linux path semantics.
category: fix
dev: Uses the POSIX path implementation so cross-platform validation cannot emit Windows mount arguments for Bubblewrap.
