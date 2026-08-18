---
"@fusion/engine": patch
---

summary: Keep scope attribution tests and runtime loading independent of the full merger module graph.
category: performance
dev: Moves the pure task-token normalizer to a leaf module shared by ownership and scope attribution.
