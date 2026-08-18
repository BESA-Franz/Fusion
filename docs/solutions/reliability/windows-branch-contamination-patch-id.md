---
title: "Branch contamination recovery must compare patch IDs on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: branch-contamination-recovery
tags:
  - branches
  - recovery
  - windows
  - git
root_cause: "The upstream patch-ID fallback embedded a POSIX while-read loop in a native-shell command"
resolution_type: fix
---

## Problem

Foreign-only branch recovery falls back to patch-ID comparison when `git cherry` cannot fully classify the supplied commits. The fallback enumerated upstream commits with a POSIX `while read` loop. Windows executes that command through `cmd.exe`, where the loop is unavailable, so the upstream patch set became empty and cherry-equivalent foreign commits were incorrectly treated as unique work.

## Contract

The recovery path feeds `git patch-id --stable` from `git log -p --format=%H`. This is the existing commit-delimited patch stream used elsewhere in the engine and works through both native shell backends. A caller-provided `mainRef` is authoritative and does not trigger unrelated integration-branch discovery.

## Surface Enumeration

- All-duplicate foreign commits.
- Mixed duplicate and unique foreign commits.
- `git cherry` failure and incomplete output fallback.
- Explicit and resolved integration refs.
- Windows `cmd.exe` and POSIX shell execution.
- No branch mutation, fetch, merge, rebase, reset, deployment, database change, or remote write.

## Symptom Verification

A deterministic mocked-shell regression test forces `git cherry` failure and proves that the fallback classifies a matching upstream patch without invoking `while read`. The two affected real-Git suites pass on Windows with 5/5 and 12/12 tests.
