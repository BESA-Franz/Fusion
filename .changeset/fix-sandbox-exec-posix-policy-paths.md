---
"@runfusion/fusion": patch
---

summary: Keep sandbox-exec profiles bound to macOS path semantics.
category: fix
dev: Uses the POSIX path implementation so cross-platform validation cannot emit Windows paths in macOS SBPL profiles.
