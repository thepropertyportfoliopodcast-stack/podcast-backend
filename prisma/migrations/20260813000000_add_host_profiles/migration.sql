ALTER TABLE "Episode"
ADD COLUMN "hostSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "Host" (
  "id" SERIAL NOT NULL,
  "uuid" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "designation" TEXT NOT NULL,
  "shortBio" TEXT NOT NULL,
  "bio" TEXT NOT NULL,
  "image" TEXT NOT NULL,
  "email" TEXT,
  "linkedinUrl" TEXT,
  "instagramUrl" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "primaryKeyword" TEXT,
  "secondaryKeywords" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Host_uuid_key" ON "Host"("uuid");
CREATE UNIQUE INDEX "Host_slug_key" ON "Host"("slug");
CREATE UNIQUE INDEX "Host_name_key" ON "Host"("name");
