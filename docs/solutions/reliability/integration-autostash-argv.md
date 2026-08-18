# Integration autostash argv boundary

The reused-worktree handoff stored its recovery stash through a shell command assembled from a locally quoted label. That duplicated the merger's quoting policy and retained POSIX escaping behavior on Windows.

The stash label and commit now go directly to Git as argv. The handoff test asserts the exact argument boundary while retaining the existing dirty-file preservation, reset, clean, audit, and refusal contracts.
