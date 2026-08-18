# Direct branch ancestry check

Foreign-only contamination recovery previously converted `git merge-base --is-ancestor` into text with `&& echo yes || echo no`. That introduced an unnecessary native-shell dependency in a safety decision.

The classifier now uses the existing bounded ancestry helper and evaluates Git's exit status directly. A real Git regression fixture proves that a stale persisted base advances to a newer live merge-base without sweeping an already-landed foreign commit into the task's unique work.
