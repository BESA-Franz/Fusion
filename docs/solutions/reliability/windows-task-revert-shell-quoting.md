---
title: "Task revert must remain transactional on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: task-revert
tags:
  - revert
  - windows
  - git
  - data-safety
root_cause: "POSIX single-quoted Git refs, SHAs, ranges, branches, and messages were passed literally through cmd.exe"
resolution_type: fix
---

## Problem

Task revert used one POSIX-only shell-quote helper across attribution, dry-run, rollback, commit, single-repo PR, workspace, and workspace-PR paths. On Windows, Git received quote characters as part of SHAs and ranges. Valid reverts therefore failed before classification or application, while the existing real-Git fixtures were themselves blocked by POSIX-only setup commands.

## Contract

Every task-revert Git argument uses backend-compatible double quotes on Windows and escaped single quotes on POSIX. Classification remains non-committing and restores the original tree and index. Apply paths remain all-or-nothing, preserve terminal-lane and `autoMerge=false` guards, and attach task attribution to every generated revert commit. PR paths never write integration branches.

## Surface Enumeration

- Squash, rebase-range, and lineage attribution.
- Clean, conflicting, already-reverted, dirty-tree, and guarded single-repo operations.
- Squashed and per-SHA commit granularity with full rollback on late conflict.
- Single-repo PR preparation and stale local branch replacement.
- Multi-repo workspace apply with all-or-nothing rollback.
- Multi-repo workspace PR preparation and late-conflict branch cleanup.
- Windows `cmd.exe` and POSIX shell argument construction.
- No database schema, HTTP, scheduler, daemon, provider, or deployment changes.

## Symptom Verification

After the single-repo fixture setup became portable, nine product cases failed with invalid quoted revisions or ranges. The platform-specific quote helper restores all 16 single-repo real-Git cases. The same helper is verified by 11 workspace, six single-repo PR, and nine workspace-PR real-Git cases; eight adjacent AI-undo contract cases also remain green.
