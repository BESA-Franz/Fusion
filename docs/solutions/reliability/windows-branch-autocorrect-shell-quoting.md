---
title: "Branch autocorrection must resolve existing branches on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: branch-autocorrect
tags:
  - branches
  - windows
  - worktrees
root_cause: "POSIX single-quoted Git refs were passed literally through cmd.exe"
resolution_type: fix
---

## Problem

Branch autocorrection built Git commands with POSIX single-quoted refs. On Windows, `cmd.exe` passed those quotes to Git as literal ref characters. A valid expected local branch was therefore reported as absent, so autocorrection returned `failed` instead of checking out the existing branch.

## Contract

Autocorrection may check out an existing expected branch, or rename a fresh branch only when the existing safety checks allow it. It must never create a missing expected branch from an arbitrary `HEAD`. Git refs use backend-compatible double quotes on Windows and escaped single quotes on POSIX.

## Surface Enumeration

- Existing expected branch checkout.
- Safe rename of a fresh observed branch.
- Upstream and shared-tip fallback behavior.
- Missing expected branch refusal; no creation from arbitrary `HEAD`.
- Windows `cmd.exe` and POSIX shell command construction.
- No daemon, database, scheduler, HTTP, or deployment lifecycle changes.

## Symptom Verification

Before the fix, the Windows real-Git fixture failed the existing-branch case while the two refusal cases passed. After the fix, all three real-Git cases and all nine unit cases pass, including exact platform-specific command construction.
