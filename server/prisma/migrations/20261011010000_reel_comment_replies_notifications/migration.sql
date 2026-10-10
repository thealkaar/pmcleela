ALTER TABLE "pmc_reel_comments"
ADD COLUMN "user_id" TEXT,
ADD COLUMN "parent_comment_id" TEXT;

UPDATE "pmc_reel_comments" AS comment
SET "user_id" = user_row."id"
FROM "pmc_users" AS user_row
WHERE lower(user_row."leela_username") = lower(comment."user");

ALTER TABLE "pmc_reel_comments"
ADD CONSTRAINT "pmc_reel_comments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "pmc_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "pmc_reel_comments_parent_comment_id_fkey"
FOREIGN KEY ("parent_comment_id") REFERENCES "pmc_reel_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "pmc_reel_comments_reel_id_created_at_idx";
CREATE INDEX "pmc_reel_comments_page_idx"
ON "pmc_reel_comments"("reel_id", "parent_comment_id", "created_at" DESC, "id" DESC);
CREATE INDEX "pmc_reel_comments_user_id_idx" ON "pmc_reel_comments"("user_id");

CREATE TABLE "pmc_user_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reel_id" TEXT,
    "comment_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    CONSTRAINT "pmc_user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pmc_user_notifications_page_idx"
ON "pmc_user_notifications"("user_id", "created_at" DESC, "id" DESC);
CREATE INDEX "pmc_user_notifications_unread_idx"
ON "pmc_user_notifications"("user_id", "read_at");

ALTER TABLE "pmc_user_notifications"
ADD CONSTRAINT "pmc_user_notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "pmc_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
