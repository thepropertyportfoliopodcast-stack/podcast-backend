DROP INDEX IF EXISTS "contact_email_key";

ALTER TABLE "contact"
ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'ENQUIRY',
ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'contact_page',
ADD COLUMN IF NOT EXISTS "sheetSyncedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sheetSyncError" TEXT;

CREATE INDEX IF NOT EXISTS "contact_email_idx" ON "contact"("email");
CREATE INDEX IF NOT EXISTS "contact_kind_createdAt_idx" ON "contact"("kind", "createdAt");
