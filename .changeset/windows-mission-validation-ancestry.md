---
"@runfusion/fusion": patch
---

summary: Classify mission validation ancestry correctly on Windows.
category: fix
dev: Mission validation now uses cmd-compatible SHA quoting for landed-checkout ancestry checks while retaining POSIX quoting on Unix.
