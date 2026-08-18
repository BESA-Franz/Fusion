# Windows merger contribution-survival audit

Post-merge audit recovery reads parent revisions and `commit:file` snapshots to prove that overlapping landed contributions survived. Its Git arguments were POSIX-single-quoted, so `cmd.exe` treated the quote characters as part of the revision and the audit failed closed even when the content was present.

The audit now uses native-shell-compatible quoting on Windows. A real Git fixture with a filename containing a space proves that the landed line is found in the final head and no false warning is emitted.
