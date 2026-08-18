# Windows scope auto-widen attribution

Scope auto-widen checks ignore rules and commit attribution before adding a changed file to a task's allowed scope. Its ranges and paths were POSIX-single-quoted, so Windows filenames with spaces were split by `cmd.exe` and valid task-owned files could not be attributed.

The Git arguments now use native-shell-compatible quoting on Windows. A real Git fixture proves that a spaced path is attributed to the task's conventional commit and accepted without widening foreign or ignored files.
