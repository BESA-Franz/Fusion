---
title: "Branch attribution must not degrade to a broad diff on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: branch-attribution
tags:
  - attribution
  - windows
  - data-safety
root_cause: "POSIX single-quoted Git ranges were passed literally through cmd.exe"
resolution_type: fix
---

## Problem

Task-owned file attribution constructed Git range and commit arguments with POSIX single quotes. On Windows, `cmd.exe` passed those quotes to Git as literal ref characters. Attribution then failed and executor capture could fall back to a broad raw diff, incorrectly including foreign or untrailered files in the task's modified-file set.

## Contract

Attribution is a safety boundary. Git refs use escaped single quotes on POSIX and backend-compatible double quotes on Windows. A task receives only files from commits attributed to its task ID under the configured trailer/subject policy. Foreign and untrailered commits remain excluded; command failure remains observable and must not be hidden as successful attribution.

## Surface Enumeration

- Callers: executor modified-file capture and merger landed-file capture.
- Attribution paths: base-to-HEAD file filtering and explicit branch-range attribution.
- Commit states: own trailer, own subject attribution, foreign trailer, untrailered, mixed contamination, and rebased contamination.
- Git operations: range diff, commit log, diff-tree, commit subject/body inspection, and merge-base-derived ranges.
- Platforms: `cmd.exe` receives JSON/double-quoted refs; POSIX shells retain escaped single-quoted refs.
- Long-running surfaces: no daemon, scheduler, database, or HTTP lifecycle changes; only bounded local Git subprocess arguments are affected.

## Symptom Verification

Before the fix, the Windows real-Git contamination fixture logged an attribution failure for a valid base SHA and returned the raw four-file diff instead of the single task-owned file. An untrailered task commit was also incorrectly included. After the fix, all four real-Git contamination cases, 18 unit/gate cases, and four landed-file attribution cases pass. Dirty integration worktree behavior remains green in three real-Git cases.
