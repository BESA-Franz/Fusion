---
"@runfusion/fusion": patch
---

summary: Revalidate transient graph resumes when their retry timer fires.
category: fix
dev: Re-fetch the task and fail closed on deletion, pause, lane drift, durable failure, cancellation, or a competing live session before re-executing.
