BEGIN;

ALTER TABLE mail_mailbox_source
  ADD COLUMN storage_backend text NOT NULL DEFAULT 'local_drive',
  ADD COLUMN storage_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN storage_secret text;

UPDATE mail_mailbox_source
SET storage_backend = 'local_drive',
    storage_config = '{}'
WHERE storage_backend IS NULL;

ALTER TABLE mail_mailbox_source
  DROP CONSTRAINT IF EXISTS mail_mailbox_source_storage_backend_check,
  ADD CONSTRAINT mail_mailbox_source_storage_backend_check
    CHECK (storage_backend IN ('local_drive', 's3_compatible')),
  DROP CONSTRAINT IF EXISTS mail_mailbox_source_storage_config_check,
  ADD CONSTRAINT mail_mailbox_source_storage_config_check
    CHECK (
      storage_backend = 'local_drive'
      OR (
        storage_config ? 'endpoint'
        AND storage_config ? 'bucket'
        AND storage_config ? 'accessKeyId'
        AND storage_secret IS NOT NULL
      )
    );

COMMIT;
