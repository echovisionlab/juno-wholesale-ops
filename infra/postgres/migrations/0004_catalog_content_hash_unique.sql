BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM catalog_snapshot
    GROUP BY supplier_id, content_hash
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'catalog_snapshot contains duplicate supplier/content_hash rows';
  END IF;
END $$;

CREATE UNIQUE INDEX idx_catalog_snapshot_supplier_content_hash_unique
  ON catalog_snapshot (supplier_id, content_hash);

COMMIT;
