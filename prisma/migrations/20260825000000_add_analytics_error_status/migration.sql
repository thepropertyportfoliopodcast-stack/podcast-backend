ALTER TABLE "AnalyticsEvent"
ADD COLUMN "isResolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "AnalyticsEvent_name_isResolved_createdAt_idx"
ON "AnalyticsEvent"("name", "isResolved", "createdAt");
