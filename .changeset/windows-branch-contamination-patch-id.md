---
"@runfusion/fusion": patch
---

summary: Restore branch-contamination patch matching on Windows.
category: fix
dev: Foreign-commit recovery now builds the upstream patch set with a native-shell-safe Git stream and skips integration-branch discovery when the caller supplies the comparison ref.
