---
"@runfusion/fusion": patch
---
summary: Keep the autostash orphan integration fixture portable on Windows.
category: internal
dev: Read the restored fixture file through Node's filesystem API instead of the POSIX-only `cat` command.
