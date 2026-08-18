---
"@fusion/engine": patch
---

summary: Preserve merger Git arguments containing dollar signs or backticks on Windows.
category: fix
dev: Uses native Windows command quoting in the shared merger Git helper and covers it with a real repository fixture.
