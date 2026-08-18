---
title: "Verification normalization must quote filters for the native shell"
date: 2026-08-18
problem_type: reliability
module: "@fusion/engine"
component: verification-tool
tags:
  - verification
  - executor
  - windows
  - shell
root_cause: "Normalized arguments with spaces always used POSIX single quotes"
resolution_type: fix
---

## Problem

The bounded verification wrapper rewrites forwarded package test filters into direct Vitest commands. Arguments containing spaces were always reconstructed with POSIX single quotes. Windows `cmd.exe` preserves those characters, so Vitest received a different literal filter and could report no matching test even though the requested path was valid.

## Contract

Command normalization preserves every parsed token as one native-shell argument. Safe tokens remain unquoted. Tokens requiring protection use JSON-compatible double quotes on Windows and escaped single quotes on POSIX. Marathon detection, package resolution, timeout, heartbeat, and process supervision behavior are unchanged.

## Surface Enumeration

- Package-scoped forwarded `--run` filters.
- Workspace-to-package relative path rewriting.
- Test paths containing spaces.
- Existing reporter and silent flags.
- CLI and dashboard package resolution.
- Windows `cmd.exe` and POSIX shell execution.
- No database schema, Git mutation, scheduler, provider, build, or deployment changes.

## Symptom Verification

The focused normalization case was red on Windows because the rewritten filter contained literal POSIX quote characters. Native-shell quoting restores the expected command. All six command-normalization cases pass.
