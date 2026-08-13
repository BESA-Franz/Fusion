---
"@runfusion/fusion": patch
---

summary: Fix planned tasks stalling ~10 minutes in Todo before Plan Review starts.
category: fix
dev: The planning→plan-review handoff now retires its predecessor work item and installs the successor continuation in one transaction (`seedStrandedPlanReviewContinuation` gained `retirePredecessorId`); the specification-complete reaction consumes the seed result with bounded retries instead of dropping failures silently.
