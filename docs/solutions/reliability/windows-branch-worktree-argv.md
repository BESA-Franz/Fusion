# Windows branch/worktree recovery argv

Branch/worktree auto-recovery previously embedded refs and paths in POSIX-single-quoted shell commands. Through `cmd.exe`, those quotes become literal characters and can make valid refs appear missing or prevent a conflicting worktree and branch from being removed.

Recovery now invokes Git with an argument vector for ref lookup, merge-base checks, worktree removal/prune, and branch deletion. Refs and Windows paths no longer pass through shell parsing, while the existing active-session and audit gates remain unchanged.
