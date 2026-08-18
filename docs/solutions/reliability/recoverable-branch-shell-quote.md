# Recoverable branch shell quoting

The no-task-done recovery probe wrapped branch names in raw double quotes. On POSIX shells dollar signs and backticks still expand inside double quotes, so a valid task branch could be mistaken for absent or compared against the wrong ref and lose its preservation gate.

Both the existence and ahead-count commands now reuse the platform-aware shell-quote helper. A focused self-healing case proves the exact commands for a branch containing both expansion characters.
