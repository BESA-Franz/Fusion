# Experiment finalization Git argv

Experiment finalization joined every Git argument into a shell command. Paths, branch names, stash labels, and commit messages therefore depended on shell-specific parsing, and the complete real Git contract was disabled on Windows.

The adapter now invokes Git with argv and passes messages without synthetic JSON quotes. Its real repository fixture runs on every platform from a path containing spaces and verifies a filename and commit subject containing dollar and backtick characters.
