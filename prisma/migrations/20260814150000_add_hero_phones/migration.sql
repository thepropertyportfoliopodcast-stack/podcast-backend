CREATE TABLE "HeroPhone" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT NOT NULL,
    "shortVideo" TEXT,
    "youtubeShortUrl" TEXT,
    "youtubeVideoUrl" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HeroPhone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HeroPhone_uuid_key" ON "HeroPhone"("uuid");
CREATE INDEX "HeroPhone_active_order_idx" ON "HeroPhone"("isActive", "displayOrder");
