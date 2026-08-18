---
title: "Already-merged recovery must preserve ownership evidence on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: already-merged-recovery
tags:
  - recovery
  - ownership
  - windows
  - git
root_cause: "POSIX-only quoting and a hard-coded /bin/sh pipeline hid valid Git ownership evidence on Windows"
resolution_type: fix
---

## Problem

Already-merged detection and its self-healing evidence layer passed refs, regexes, SHAs, ranges, and rev expressions through POSIX single quotes. Windows treated those quotes as argument content, hiding valid trailer, lineage, ancestry, no-diff, patch-ID, and tree-equality proof. Patch-ID detection additionally forced `/bin/sh` and embedded a POSIX-only quoted format argument.

## Contract

Ownership recovery may finalize a task only from anchored task/lineage trailers, anchored subjects, or canonical-branch content proof. Prose mentions, foreign task or lineage trailers, and misbound branches remain rejection evidence. Windows uses backend-compatible double quotes; POSIX retains escaped single quotes. Pipeline commands use Node's native shell and quote complete Git arguments.

## Surface Enumeration

- Task and lineage trailer lookup.
- Anchored ancestry lookup; prose mentions remain excluded.
- Canonical no-diff branches at or behind the integration branch.
- Patch-ID and tree-equality fallback with foreign-owner rejection.
- Branch-misbound and previous-tip recovery.
- Idempotent maintenance passes.
- Fetch-then-prove against a stale local integration branch.
- Windows native shell and POSIX shell execution.
- No database schema, HTTP, scheduler, provider, or deployment changes.

## Symptom Verification

After making the fixtures portable, six of ten direct ownership cases returned `null` for valid evidence. Platform-specific quoting restored all ten. The self-healing integration then improved from two of thirteen to eleven of thirteen; removing the forced POSIX pipeline and quoting complete patch/range/rev arguments restored the final patch-ID and tree-equality cases. The final full integration suite passes 13 of 13.
