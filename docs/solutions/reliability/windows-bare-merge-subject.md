# Windows bare merge subject regeneration

When a merge lands with the last-resort `merge <branch>` subject, Fusion reads its diff stat and asks the configured summarizer for a useful title. The commit SHA was POSIX-single-quoted, so the Windows Git read failed and silently retained the bare subject.

The Git revision now uses native-shell-compatible quoting on Windows. A real Git fixture proves that the diff stat reaches the summarizer and the descriptive subject replaces the fallback.
