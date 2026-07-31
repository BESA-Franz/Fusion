---
"@runfusion/fusion": patch
---

summary: Ignore blank optional artifact payload fields when another payload source is present.
category: fix
dev: Agent artifact registration now normalizes provider-materialized empty strings before enforcing the exactly-one-payload contract.
