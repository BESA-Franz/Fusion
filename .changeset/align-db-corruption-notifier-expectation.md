---
"@runfusion/fusion": patch
---
summary: Keep the healthy-database corruption test focused on observable notification and audit effects.
category: fix
dev: Allow unrelated maintenance to read the active notifier while still asserting that no corruption notification or audit is emitted.
