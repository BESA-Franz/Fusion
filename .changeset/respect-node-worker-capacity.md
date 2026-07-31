---
"@runfusion/fusion": patch
---

summary: Enforce each Fusion node's configured concurrency limit across its project engines.
category: fix
dev: The process semaphore now uses the lower of globalMaxConcurrent and the runtime node maxConcurrent value.
