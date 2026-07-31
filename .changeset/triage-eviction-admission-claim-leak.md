---
"@runfusion/fusion": patch
---

summary: Release admission claims when triage evicts a hung planner.
category: fix
dev: Triage eviction now clears the coordinator admission marker and returns an untransferred pre-held host slot, so the task can be offered again without waiting for an engine restart.
