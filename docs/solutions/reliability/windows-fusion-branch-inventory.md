---
title: "Fusion branch maintenance must inventory branches on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: worktree-maintenance
tags:
  - self-healing
  - worktrees
  - windows
  - git
root_cause: "The fusion/* branch pattern used POSIX single quotes through cmd.exe"
resolution_type: fix
---

## Problem

Both orphan-branch scanning and stale-active branch recovery invoked `git branch --list` with a POSIX single-quoted `fusion/*` pattern. Windows `cmd.exe` preserved the quotes as literal pattern characters, so Git returned no branches. Maintenance therefore treated the local branch inventory as empty and could not classify or recover abandoned Factory branches.

## Contract

The `fusion/*` glob is passed as one argument without allowing the shell to expand it. Windows uses backend-compatible double quotes; POSIX retains escaped single quotes. Inventory remains read-only, and all existing ownership, active-task, archive, pause, worktree, and unique-commit gates continue to decide whether later recovery is permitted.

## Surface Enumeration

- Periodic orphan-branch inventory.
- Stale-active branch recovery inventory.
- Fusion branches with no active task.
- Non-Fusion local branches excluded from the result.
- Active, archived, paused, checked-out, and unique-commit preservation gates.
- Windows native shell and POSIX shell execution.
- No database schema, HTTP, scheduler, provider, build, deployment, or branch deletion in verification.

## Symptom Verification

The focused real-Git fixture reproduced an empty result on Windows despite a local `fusion/fn-orphan` branch. Native-shell quoting restores the expected one-branch inventory while excluding a non-Fusion branch. All eight focused stale-active recovery cases also pass with the corrected command shape.
