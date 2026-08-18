---
title: "Base-commit capture must preserve the task fork point on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: base-commit-capture
tags:
  - attribution
  - windows
  - git
  - worktrees
root_cause: "A POSIX-only compound merge-base command failed through cmd.exe and silently fell back to HEAD"
resolution_type: fix
---

## Problem

Fresh task worktrees captured their comparison base with one shell command containing POSIX single quotes, `2>/dev/null`, and `||`. On Windows, the command failed through `cmd.exe`. A feature branch therefore fell back to its own `HEAD` rather than recording the integration-branch fork point, collapsing later commit-distance and changed-file evidence.

## Contract

Base capture probes the local integration ref first because it may contain merged but unpushed work. Only when that probe fails does it inspect `origin/<integration-ref>`. `HEAD` remains the final non-fatal fallback when neither ref resolves. Git refs use backend-compatible double quotes on Windows and escaped single quotes on POSIX.

## Surface Enumeration

- Local integration branch at the current task fork point.
- Local integration branch ahead of its remote counterpart.
- Feature branch with task-owned commits after the fork.
- Missing local branch with a resolvable origin ref.
- Missing local and origin refs with a final `HEAD` fallback.
- Fresh executor capture and resumed-session base preservation.
- Windows native shell and POSIX shell execution.
- No database schema, HTTP, scheduler, provider, build, or deployment changes.

## Symptom Verification

After making the real-Git fixtures portable, the feature-branch case returned its own `HEAD` instead of the expected fork-point SHA. Sequential local-then-origin probes restore all four direct real-Git cases. Twelve base-capture unit/gate cases and the one 18-commit executor real-Git regression case also pass.
