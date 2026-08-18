---
title: "Executor worktree Git operations must use native-shell quoting on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: executor-worktrees
tags:
  - executor
  - worktrees
  - windows
  - git
root_cause: "A shared POSIX-only argument helper made branch refs and commit messages invalid through cmd.exe"
resolution_type: fix
---

## Problem

The executor quoted dependency refs, remote refs, and generated commit messages with POSIX single quotes. Windows `cmd.exe` preserves those quotes as literal characters. Real dependency imports therefore failed because Git looked for a branch whose name included quote characters; the same helper also affected fresh-worktree fetch and rebase commands and squash-import ancestry planning.

## Contract

Commands executed by the native backend shell use JSON-compatible double-quoted arguments on Windows and escaped POSIX single-quoted arguments on Unix. The quoting boundary remains centralized in the executor helper so dependency imports, ancestry planning, and remote refresh cannot drift independently.

## Surface Enumeration

- Dependency-tip ancestry checks and already-represented no-op handling.
- Squash merge and attributed import commit creation.
- Squash-import planning against the local or remote main base.
- Fresh-worktree fetch and integration-branch rebase.
- Rebase conflict detection and abort behavior.
- Branch refs, commit SHAs, and generated commit messages.
- Windows native shell and POSIX shell execution.
- No database schema, HTTP, scheduler, provider, build, or deployment changes.

## Symptom Verification

Before the fix, the real-Git dependency import failed on Windows because `git merge --squash` received a literal quoted branch name. The shared native-shell helper restores both real-Git executor cases: dependency import with commit attribution and squash-import planning from resolved SHAs. Six focused fresh-worktree refresh and conflict tests also pass with platform-derived command expectations.
