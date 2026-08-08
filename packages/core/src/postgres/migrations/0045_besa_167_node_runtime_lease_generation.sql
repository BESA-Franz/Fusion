-- FNXC:NodeRuntimeLease 2026-08-05-02:53: Additive and defaulted so upgraded
-- PostgreSQL clusters and rows imported from the retired SQLite runtime start
-- with a valid fencing generation without rewriting legacy source databases.
ALTER TABLE central.nodes
  ADD COLUMN IF NOT EXISTS runtime_lease_generation bigint NOT NULL DEFAULT 0;

ALTER TABLE central.nodes
  ALTER COLUMN runtime_lease_generation SET DEFAULT 0;
UPDATE central.nodes
SET runtime_lease_generation = 0
WHERE runtime_lease_generation IS NULL;
ALTER TABLE central.nodes
  ALTER COLUMN runtime_lease_generation SET NOT NULL;
