CREATE TABLE "pmc_reel_likes" (
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmc_reel_likes_pkey" PRIMARY KEY ("reel_id", "user_id")
);

CREATE TABLE "pmc_reel_comments" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "user_year" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmc_reel_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pmc_reel_likes_user_id_idx" ON "pmc_reel_likes"("user_id");
CREATE INDEX "pmc_reel_comments_reel_id_created_at_idx" ON "pmc_reel_comments"("reel_id", "created_at" DESC);

ALTER TABLE "pmc_reel_likes"
ADD CONSTRAINT "pmc_reel_likes_reel_id_fkey"
FOREIGN KEY ("reel_id") REFERENCES "pmc_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pmc_reel_likes"
ADD CONSTRAINT "pmc_reel_likes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "pmc_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pmc_reel_comments"
ADD CONSTRAINT "pmc_reel_comments_reel_id_fkey"
FOREIGN KEY ("reel_id") REFERENCES "pmc_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "pmc_reel_comments" ("id", "reel_id", "user", "user_year", "text", "created_at")
SELECT
    'legacy_' || reel.id || '_' || comment_number::text,
    reel.id,
    coalesce(entry->>'user', 'Anonymous Student'),
    coalesce(entry->>'userYear', 'Student'),
    coalesce(entry->>'text', ''),
    reel.created_at
FROM "pmc_reels" AS reel
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(reel.data->'comments') = 'array' THEN reel.data->'comments'
        ELSE '[]'::jsonb
    END
) WITH ORDINALITY AS entries(entry, comment_number)
WHERE coalesce(entry->>'text', '') <> ''
ON CONFLICT ("id") DO NOTHING;

UPDATE "pmc_reels"
SET "data" = jsonb_set(
    jsonb_set("data", '{likesCount}', '0'::jsonb, true),
    '{isLiked}', 'false'::jsonb, true
);
