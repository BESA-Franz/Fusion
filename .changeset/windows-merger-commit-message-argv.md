---
"@runfusion/fusion": patch
---
summary: Preserve multiline merge commit bodies on Windows by passing Git message values through argv.
category: fix
dev: Merge finalization no longer routes generated commit messages through cmd.exe, so AI narrative and trailer lines are retained exactly.
