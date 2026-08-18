# Integration remote argv boundary

Integration remote discovery interpolated the configured branch into `git config` shell text. A branch containing shell-significant characters could therefore query the wrong key or fail before Fusion reached the merge handoff.

Both branch-config lookup and repository-remote listing now use Git argv. The focused contract verifies the exact config-key argument for a branch containing dollar and backtick characters.
