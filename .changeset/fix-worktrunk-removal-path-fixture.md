---
"@runfusion/fusion": patch
---

summary: Keep worktrunk removal routing coverage portable on Windows.
category: fix
dev: Compares the native cleanup path produced by node:path instead of a hard-coded POSIX literal.
