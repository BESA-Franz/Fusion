# Windows merger Git argument quoting

The merger's shared Git command helper used POSIX backslash escapes for dollar signs and backticks. Windows `cmd.exe` passes those backslashes to Git, so valid refs, labels, or paths containing either character no longer matched their repository objects.

The shared helper now serializes Windows arguments with native double-quote escaping while retaining the existing POSIX behavior elsewhere. A real Git fixture modifies a file containing both characters and proves that a shell-executed scoped diff still resolves the exact path.
