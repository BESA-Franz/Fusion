# Windows worktree Git-ref fallback

## Problem

The executor resolved contamination and diff bases with a single POSIX shell expression using `2>/dev/null || ...`. On Windows, `cmd.exe` does not provide the `/dev/null` target, so a missing preferred ref could prevent the intended fallback ref from being checked.

## Resolution

`worktree-git-refs.ts` now probes each candidate ref in the required order with a separate bounded Git command:

- contamination base: local `main`, then `origin/main`;
- diff base: `origin/main`, then local `main`, then the existing `HEAD~1` fallback.

The contract tests assert both command order and the absence of POSIX redirection or shell fallback operators.
