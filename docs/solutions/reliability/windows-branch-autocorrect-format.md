---
title: "Fresh branch autocorrect must parse ref names on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: branch-autocorrect
tags:
  - executor
  - branches
  - windows
  - git
root_cause: "The for-each-ref format argument retained POSIX quotes through cmd.exe"
resolution_type: fix
---

## Problem

Branch autocorrect already used native-shell quoting for branch refs, but its `git for-each-ref` format remained POSIX single-quoted. Windows `cmd.exe` passed those quotes literally, so Git emitted quoted branch names. A genuinely fresh observed branch no longer exactly matched its parsed ref and fell through to the existing-branch path, which failed when the expected branch had not yet been created.

## Contract

Freshness classification compares normalized, unquoted local ref names. The format argument uses the same native-shell quoting boundary as branch refs: double quotes on Windows and escaped single quotes on POSIX. Autocorrect may rename only a fresh branch; shared-tip, upstream, tag-only, or missing-expected-ref cases retain their fail-closed behavior.

## Surface Enumeration

- Fresh no-upstream branch with one containing local ref.
- Existing expected branch checkout without tip mutation.
- Foreign/shared-tip branch preservation.
- Same-named tag rejection.
- Missing expected branch fail-closed path.
- Windows native shell and POSIX shell execution.
- No database schema, HTTP, scheduler, provider, build, deployment, or remote Git operation.

## Symptom Verification

The new real-Git case failed before the fix with `expected branch ... does not exist` instead of renaming the fresh observed branch. It now preserves the tip, removes the old ref name, and returns `renamed`. The complete focused set of four real-Git and nine unit cases passes.
