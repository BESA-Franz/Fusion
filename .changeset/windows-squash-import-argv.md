---
"@runfusion/fusion": patch
---
summary: Make dependency squash-import commands safe on Windows.
category: fix
dev: Pass merge, reset, diff, and commit arguments through execFile so dependency content is not lost to POSIX shell quoting.
