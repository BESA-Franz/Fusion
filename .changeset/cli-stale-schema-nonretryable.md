---
"@runfusion/fusion": patch
---

summary: Stop supervised restart loops when the Fusion binary is older than the database schema.
category: fix
dev: Dashboard and daemon startup now classify StaleBinarySchemaError as non-retryable exit code 87, matching other deterministic database compatibility failures. Supervisors can stop immediately instead of consuming crash retries against an incompatible runtime.
