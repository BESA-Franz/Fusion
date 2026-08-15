---
"@runfusion/fusion": patch
---

summary: Resolve duplicate redirects declared in task titles without discarding executable plans.
category: fix
dev: Reuse the conflict-aware prompt/title marker resolver in triage and self-healing, preserve user pauses, and clear only the source that contains the redirect marker.
