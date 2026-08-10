---
"@runfusion/fusion": patch
---

summary: Tasks assigned to an engineer agent now execute continuously instead of stalling until a heartbeat.
category: fix
dev: Workflow principal routing separates structural capability from availability. A named principal that can never satisfy a node (wrong role, deleted, authority edited away) is no longer authority for it — routing falls through to the column binding and role pool, and a resumed continuation discards the stale fence and re-routes. A role-capable principal that is only paused/disabled/at capacity still holds, unchanged. An explicitly assigned engineer-role agent is now valid `task-assignee` authority for an executor node; the role pool stays strict.
