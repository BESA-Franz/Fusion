---
category: performance
module: packages/core/src/task-store/task-deleted-outbox-consumer.ts
date: 2026-08-18
problem_type: performance
severity: high
applies_when:
  - "Many per-project task-lifecycle consumers poll an empty outbox on a fixed cadence"
  - "Paused or idle projects continue producing cursor and lease queries without new lifecycle events"
tags:
  - performance
  - idle-backoff
  - jitter
  - task-lifecycle
  - outbox
---

# Task-lifecycle outbox idle backoff

## Problem

The task-deleted outbox consumer used a fixed 5-second interval. With dashboard and engine stores
for many projects, that made idle projects continue issuing the same cursor, lease, and outbox
queries even when no lifecycle event could be delivered.

## Contract

The consumer now self-schedules its next poll:

- An empty outbox is the only state that increases the idle delay, by 10 seconds per poll, up to
  60 seconds.
- A delivered event, lease contention, fencing, shutdown race, or transient error resets to the
  5-second base.
- A durable per-event retry window schedules the next probe at its recorded retry deadline, so it
  does not poll repeatedly during the wait.
- Bounded jitter desynchronizes independent consumers.

Backoff changes only when polling occurs. Cursor fencing, lease renewal, in-order acknowledgement,
and at-least-once delivery remain unchanged.

## Verification

The dedicated backoff test covers idle growth, bounded jitter, active-consumer cadence, independent
consumers, mid-backoff bursts, shutdown, transient errors, and exact retry-deadline wake-up.
Production CPU, query-scan, and health-latency improvements remain deployment measurements; this
local change does not restart or deploy the privileged Fusion runtime.
