DROP INDEX "Episode_slug_key";

WITH episode_slugs AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        TRIM(BOTH '-' FROM REGEXP_REPLACE(
          LOWER(REGEXP_REPLACE(
            title,
            '^[[:space:]]*ep(isode)?\.?[[:space:]]*[0-9]+[[:space:]]*[|.:–—-]*[[:space:]]*',
            '',
            'i'
          )),
          '[^a-z0-9]+',
          '-',
          'g'
        )),
        ''
      ),
      'episode'
    ) AS base_slug
  FROM "Episode"
),
ranked_slugs AS (
  SELECT
    id,
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS slug_number
  FROM episode_slugs
)
UPDATE "Episode" AS episode
SET "slug" = CASE
  WHEN ranked_slugs.slug_number = 1 THEN ranked_slugs.base_slug
  ELSE ranked_slugs.base_slug || '-' || episode.id
END
FROM ranked_slugs
WHERE episode.id = ranked_slugs.id;

CREATE UNIQUE INDEX "Episode_slug_key" ON "Episode"("slug");
