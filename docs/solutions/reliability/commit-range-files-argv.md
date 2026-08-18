# Commit-range file reader argv

The AI-squash file-scope invariant interpolated its approved commit range into shell text and parsed newline-delimited paths. Valid refs containing command separators failed on Windows before the invariant could inspect the committed files.

The reader now sends the range directly to Git as argv, terminates revision parsing explicitly, and consumes NUL-delimited paths. A real Git fixture proves refs containing ampersands and a changed path containing spaces.
