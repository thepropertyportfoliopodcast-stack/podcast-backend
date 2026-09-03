CREATE TABLE "AnalyticsIpExclusion" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsIpExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsIpExclusion_value_key"
ON "AnalyticsIpExclusion"("value");

CREATE INDEX "AnalyticsIpExclusion_isActive_idx"
ON "AnalyticsIpExclusion"("isActive");
