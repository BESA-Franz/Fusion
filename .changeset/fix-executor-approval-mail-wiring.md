---
"@runfusion/fusion": patch
---

summary: Restore approval-mail delivery from both executor gate closures.
category: fix
dev: Reuses the idempotent fail-soft mailbox writer already used by heartbeat and triage gates.
