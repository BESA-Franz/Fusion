---
"@runfusion/fusion": patch
---

summary: Ignore absent artifact payload optionals before provider argument conversion.
category: fix
dev: Agent artifact registration removes raw null, undefined, and blank optional payload fields before PI converts arguments, while preserving real strings and the fail-closed exactly-one-payload contract.
