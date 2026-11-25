ALTER TABLE "Episode"
ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Episode"
SET "categories" = ARRAY(
  SELECT btrim(existing_category)
  FROM unnest(string_to_array(COALESCE("topic", ''), ',')) AS existing(existing_category)
  WHERE btrim(existing_category) <> ''
);
