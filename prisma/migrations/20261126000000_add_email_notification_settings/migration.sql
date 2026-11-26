CREATE TABLE "EmailNotificationSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "adminIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailNotificationSetting_pkey" PRIMARY KEY ("id")
);
