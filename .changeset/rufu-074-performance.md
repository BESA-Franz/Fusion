---
"@runfusion/fusion": patch
---

summary: Reduce idle task-lifecycle outbox polling with bounded backoff and jitter.
category: performance
dev: TaskDeletedOutboxConsumer now self-schedules: an empty outbox grows from 5s toward a 60s cap with bounded jitter, while delivered events and transient waits reset to the fast cadence. Durable retry windows wake at their recorded deadline. Delivery ordering, cursor fencing, leases, and at-least-once semantics are unchanged.
