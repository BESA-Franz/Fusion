---
title: "Mission validation must classify landed ancestry on Windows"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: mission-validation
tags:
  - missions
  - validation
  - windows
  - git
root_cause: "POSIX single-quoted SHAs made valid ancestry checks fail through cmd.exe"
resolution_type: fix
---

## Problem

Mission validation checks whether its inspection root contains the exact landed merge before trusting a fail verdict. The Git ancestry command passed the landed SHA in POSIX single quotes. Windows treated those quotes as part of the revision, so valid ancestry evidence appeared unavailable. A stale checkout was not classified as stale, and a fresh checkout could incorrectly defer a real failure instead of creating its remediation feature.

## Contract

Exit zero from `git merge-base --is-ancestor` proves the inspection root contains the landed code. Exit one proves the checkout predates it. Bad objects, non-repositories, and other failures remain unavailable evidence and must defer remediation. Windows uses backend-compatible double quotes for the SHA; POSIX retains escaped single quotes.

## Surface Enumeration

- Landed commit absent from the inspected checkout: stale and inconclusive.
- Landed commit at or behind inspected `HEAD`: fresh and normal validation flow.
- Invalid or unavailable landed revision: unproven inspection, no remediation task.
- Disposable landed checkout and ambient-root fallback behavior.
- Static and behavioral mission validation paths.
- Windows native shell and POSIX shell execution.
- No database schema, provider, scheduler, build, or deployment changes.

## Symptom Verification

Before the fix, two of the three focused real-Git ancestry cases failed: stale and fresh valid revisions both became unavailable evidence, while the bad-object guard passed. Platform-specific SHA quoting restores all three focused cases. The complete mission-execution-loop suite passes all 95 cases.
