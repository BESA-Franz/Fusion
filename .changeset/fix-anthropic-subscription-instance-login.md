---
"@runfusion/fusion": patch
---

summary: Fix Anthropic Subscription login failing with "Unknown provider: anthropic-subscription".
category: fix
dev: Instance-scoped OAuth login (`loginInstance`) now reuses the Anthropic-aware login seam, logging in upstream as `anthropic` and persisting to the `anthropic-subscription` storage row, instead of passing the storage-only id to `ModelRuntime.login` (GitHub #3462).
