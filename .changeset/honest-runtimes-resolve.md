---
"@runfusion/fusion": patch
---

summary: Resolve runtime node identity and quote Git evidence commands correctly on Windows.
category: fix
dev: `FUSION_NODE_ID` now selects the runtime node in shared PostgreSQL registries, while recovery Git commands use host-appropriate shell quoting.
