---
title: "Automatic worktree cleanup must fail closed on unverified content"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: worktree-cleanup
tags:
  - worktree
  - cleanup
  - data-safety
root_cause: "automatic cleanup converted failed or unverifiable worktree removal into recursive filesystem deletion"
resolution_type: fix
---

## Problem

Pool pruning and orphan reaping could recursively remove a directory after Git refused removal or when the directory was not registered at all. In both states Fusion lacked a trustworthy baseline proving that modified, untracked, ignored, or unreadable content was disposable.

## Contract

Automatic pool cleanup is defensive and non-forced. A registered worktree is removed only when the selected backend accepts a non-forced removal. An unregistered directory is removed only after ownership-aware secret cleanup succeeds and a fresh directory read proves it empty. A dangling `.git` pointer, any remaining entry, or any inspection or cleanup error preserves the directory for operator recovery. Explicit executor-owned hard-cancel and disposal paths retain their existing forced behavior.

## Surface Enumeration

- Providers: native Git and Worktrunk removal backends.
- Call paths: `removeWorktree`, `cleanupOrphanedWorktrees`, and `reapOrphanWorktrees`.
- States: registered clean, registered dirty, unregistered empty, unregistered populated, secret cleanup failure, unreadable directory, valid `.git` pointer, and dangling `.git` pointer.
- Platforms: command construction and path assertions cover Windows and POSIX path forms; empty-directory removal uses the cross-platform directory API.
- Long-running surfaces: no daemon, scheduler, or HTTP lifecycle is changed; the behavior is limited to bounded cleanup calls.
- Shared modules: backend selection and pool cleanup are shared by native and Worktrunk-enabled projects, so the force flag is explicit at their common boundary.

## Symptom Verification

The original symptom was reproduced with three assertions: a non-forced native Git rejection fell through to recursive deletion, an unregistered orphan containing a user file was removed, and a dangling `.git` directory was treated as disposable. The regression suite now proves that all three paths preserve content. It also proves that an authorized secret cleanup can leave an orphan empty and removable, that cleanup failures preserve the directory, that Worktrunk receives `--force` only from explicit caller intent, and that legacy forced native disposal still works outside pool pruning.
