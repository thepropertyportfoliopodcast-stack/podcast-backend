ALTER TABLE "Episode"
ADD COLUMN IF NOT EXISTS "guestHostSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Host"
ADD COLUMN IF NOT EXISTS "isGuestOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Host_guest_active_order_idx"
ON "Host"("isGuestOnly", "isActive", "displayOrder");
