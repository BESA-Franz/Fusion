/*
BESA:MissionTaskPrefixRepair 2026-07-29:
Migration 0037 guarded its ALTER with to_regclass(project.missions), but the
applier still recorded 0037 when that lookup returned NULL. Such a database
looks current while mission reads fail because task_prefix is absent.

The baseline must have created project.missions before a forward migration is
recorded. Do not silently skip a missing table here: ADD COLUMN IF NOT EXISTS
repairs the known drift and remains idempotent on correctly migrated databases.
*/

ALTER TABLE project.missions
  ADD COLUMN IF NOT EXISTS task_prefix text;
