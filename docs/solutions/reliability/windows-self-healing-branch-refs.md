---
title: "Self-healing branch rebind must read exact ref names on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: self-healing-branch-rebind
tags:
  - self-healing
  - branches
  - windows
  - git
root_cause: "The for-each-ref format argument used POSIX single quotes through cmd.exe"
resolution_type: fix
---

## Problem

In-review branch rebind enumerated local Fusion refs with a POSIX single-quoted `for-each-ref` format. Windows `cmd.exe` preserved those characters, so Git returned ref names wrapped in literal quotes. Case-variant candidates discovered only through the inventory could therefore not match the task ID or be evaluated for safe metadata repair.

## Contract

Self-healing obtains local `fusion/*` refs through one bounded evidence reader. The format is one native-shell argument: double-quoted on Windows and escaped single-quoted on POSIX. Returned names are trimmed but otherwise preserved exactly. Inventory failure remains fail-soft and produces no repair candidate.

## Surface Enumeration

- In-review branch-rebind inventory.
- Exact and case-variant Fusion branch names.
- Non-Fusion branch exclusion by Git ref namespace.
- Missing repository or Git failure returning no candidates.
- Existing rebind ownership, ambiguity, unique-work, lease, and worktree-preservation gates.
- Windows native shell and POSIX shell execution.
- No database schema, scheduler, provider, build, deployment, or remote Git operation.

## Symptom Verification

The new real-Git test initially failed because the bounded reader did not yet exist. With the reader wired into branch rebind, Windows returns the exact `fusion/Fn-Case` ref and excludes a non-Fusion branch. The PostgreSQL-backed lifecycle certification remains an environment skip on this host and is not claimed as executed.
