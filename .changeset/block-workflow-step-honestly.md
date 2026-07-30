---
"@runfusion/fusion": patch
---

summary: Blocked workflow steps now stop dependent work and preserve their exact resume point instead of appearing complete.
category: fix
dev: Adds a structured `fn_step_blocked` result for graph-owned step sessions, reuses the existing honest blocked-task park contract, and exposes the authoritative session project ID without adding project identity to task payloads.
