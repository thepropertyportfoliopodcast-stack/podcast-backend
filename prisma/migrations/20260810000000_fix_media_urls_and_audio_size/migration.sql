ALTER TABLE "public"."Episode" ADD COLUMN "audioSize" BIGINT;

UPDATE "public"."Episode"
SET
  "link" = REPLACE("link", '&', '%26'),
  "audio" = REPLACE("audio", '&', '%26')
WHERE "link" LIKE '%&%' OR "audio" LIKE '%&%';

UPDATE "public"."Episode"
SET "audioSize" = 41125100
WHERE "uuid" = 'b127ed5d-ed62-4dfa-88e2-fbc3cc48324e';

UPDATE "public"."Episode"
SET "audioStatus" = 'COMPLETED'
WHERE "audio" IS NOT NULL AND "audio" <> '';
