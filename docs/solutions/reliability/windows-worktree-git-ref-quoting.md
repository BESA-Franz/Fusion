---
title: "Worktree Git refs need shell-specific quoting on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: worktree-acquisition
tags:
  - worktree
  - windows
  - git
root_cause: "POSIX single quotes were passed literally through cmd.exe and changed Git ref arguments"
resolution_type: fix
---

## Problem

Worktree base refresh and bare-branch collision recovery constructed Git commands with POSIX single-quoted refs. Node runs `exec` through `cmd.exe` on Windows, where single quotes are ordinary characters. Valid refs such as `main^{commit}` and `refs/heads/fusion/fn-1` therefore became different, invalid ref names.

## Contract

Git refs use shell-specific quoting at the shared command boundary: escaped single quotes on POSIX shells and JSON-compatible double quotes on Windows. The Windows form matches the native worktree backend's established command construction. Base refresh must resolve and advance a safe stale base, and collision recovery must classify and preserve or reclaim an existing branch according to its attribution rather than treating it as missing.

## Surface Enumeration

- Providers: native Git base refresh and native Git bare-branch collision recovery; Worktrunk refresh remains intentionally unsupported and unchanged.
- Acquisition paths: fresh recreation after quarantine, reuse of an existing native worktree, pooled native reuse, and native fallback while Worktrunk is enabled.
- Git operations: `rev-parse`, `merge-base`, ancestry checks, history/attribution inspection, reset, rebase, attach, and branch recreation.
- Collision states: merged, fully subsumed, task-attributed reclaimable, foreign or mixed unmerged, and live foreign checkout.
- Platforms: `cmd.exe` receives JSON/double-quoted refs; POSIX shells retain escaped single-quoted refs.
- Long-running surfaces: no daemon, HTTP, scheduler, or database behavior changes; only bounded local Git subprocess arguments are affected.

## Symptom Verification

Before the fix, real Windows fixtures returned `base-unresolvable` for a valid `main` branch and all five collision classifications either failed or misclassified the branch. The acquisition suite also exposed Windows-only path, junction, command, line-ending, and patch-ID assumptions. After the fix, all 44 acquisition cases, all five real-Git collision cases, all 16 base-refresh cases, and all 52 shared branch-conflict cases pass on Windows. The assertions cover safe reset/rebase, quarantine recreation, task-attributed preservation, refusal of foreign histories, live checkout protection, and compensation after conflicts.
