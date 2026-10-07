ALTER TABLE "pmc_users"
ADD COLUMN "leela_username" TEXT;

UPDATE "pmc_users"
SET "leela_username" = lower('Leela_' || substring("id" FROM 5)),
    "data" = jsonb_set(
      "data",
      '{leelaUsername}',
      to_jsonb('Leela_' || substring("id" FROM 5)),
      true
    );

ALTER TABLE "pmc_users"
ALTER COLUMN "leela_username" SET NOT NULL;

CREATE UNIQUE INDEX "pmc_users_leela_username_key"
ON "pmc_users" ("leela_username");

UPDATE "pmc_reels" AS reel
SET "data" = jsonb_set(reel."data", '{creatorName}', to_jsonb(user_row."leela_username"), true)
FROM "pmc_users" AS user_row
WHERE reel."creator_id" = user_row."id";

UPDATE "pmc_reel_comments" AS comment
SET "user" = user_row."leela_username"
FROM "pmc_users" AS user_row
WHERE lower(comment."user") = lower(user_row."data"->>'anonymousName');

CREATE TABLE "pmc_chat_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reported_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blocked_until" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmc_chat_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pmc_chat_reports_reported_user_created_at_idx"
ON "pmc_chat_reports"("reported_user_id", "created_at" DESC);

ALTER TABLE "pmc_chat_reports"
ADD CONSTRAINT "pmc_chat_reports_reporter_id_fkey"
FOREIGN KEY ("reporter_id") REFERENCES "pmc_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pmc_chat_reports"
ADD CONSTRAINT "pmc_chat_reports_reported_user_id_fkey"
FOREIGN KEY ("reported_user_id") REFERENCES "pmc_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
