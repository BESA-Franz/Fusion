# Windows lost-work durability proof

Before deleting a stuck task checkout, Fusion proves that completed steps have durable branch commits. The proof previously appended POSIX `2>/dev/null` redirection to both Git commands, which is not portable through `cmd.exe`.

The proof now uses the shared native-shell argument quoting and plain bounded Git commands. If either command fails, Fusion retains the existing fail-closed behavior and resets the affected step progress instead of claiming that removed work survived.
