---
"@runfusion/fusion": patch
---

summary: Capture task fork points correctly on Windows.
category: fix
dev: Base-commit capture now probes local and origin integration refs sequentially with native-shell quoting instead of a POSIX-only compound command.
