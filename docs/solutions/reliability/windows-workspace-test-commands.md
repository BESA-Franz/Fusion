# Windows scoped workspace test commands

Diff-proportional merger verification derives package filters and direct Vitest paths from the branch diff. Those refs, filters, and paths were POSIX-single-quoted, so `cmd.exe` could reject the Git diff or pass literal quote characters to pnpm and Vitest.

Command derivation now uses native-shell-compatible quoting on Windows. Unit expectations are platform-aware, and a real Git workspace fixture proves that a changed test path containing a space produces the exact scoped verification command.
