---
title: "Foreign-only recovery must confirm branch deletion"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: foreign-only-contamination-recovery
tags:
  - recovery
  - branches
  - windows
  - data-safety
root_cause: "Windows branch quoting made deletion fail, and the failure was ignored before task ownership was cleared"
resolution_type: fix
---

## Problem

The foreign-only recovery fallback deleted a task branch with a POSIX single-quoted ref and ignored deletion errors. On Windows, `cmd.exe` passed the quote characters to Git. Recovery then reported success and cleared the task's branch and worktree ownership even though the branch still existed.

## Contract

Recovery may discard a branch only after classifying it as foreign-only, proving that no active task session owns its worktree, and receiving a successful Git branch deletion. A failed deletion preserves task ownership, emits a bounded skipped-recovery audit event, and returns a non-recovered result. Windows uses backend-compatible double quotes; POSIX retains escaped single quotes.

## Surface Enumeration

- Usable worktree path: reanchor the task branch to its base without discarding foreign commits.
- Missing worktree path: prune stale registrations, then delete only the classified task branch.
- Active session: refuse discard before Git mutation.
- Deletion failure: preserve task branch/worktree state and report `branch-discard-failed`.
- Deletion success: clear task ownership only after Git confirms deletion.
- Windows `cmd.exe` and POSIX command construction.
- No database schema, HTTP, scheduler, daemon, or deployment changes.

## Symptom Verification

After making the existing fixture portable, the new Windows real-Git case showed recovery returning `branch-discard` while `refs/heads/fusion/fn-x` remained present. With platform-specific quoting and the fail-closed deletion gate, all four real-Git recovery cases pass, including a deliberately undeletable checked-out branch whose task ownership remains intact.
