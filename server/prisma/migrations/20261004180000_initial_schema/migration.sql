CREATE TABLE IF NOT EXISTS "pmc_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "anonymous_name" TEXT NOT NULL,
    "scholar_no" TEXT NOT NULL,
    "phone" TEXT,
    "data" JSONB NOT NULL,
    CONSTRAINT "pmc_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pmc_users_email_key" ON "pmc_users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_users_anonymous_name_key" ON "pmc_users"("anonymous_name");
ALTER TABLE "pmc_users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
CREATE INDEX IF NOT EXISTS "pmc_users_phone_idx" ON "pmc_users"("phone");

CREATE TABLE IF NOT EXISTS "pmc_reels" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "pmc_reels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pmc_reels_created_at_idx" ON "pmc_reels"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "pmc_reels_creator_id_idx" ON "pmc_reels"("creator_id");

ALTER TABLE "pmc_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pmc_reels" ENABLE ROW LEVEL SECURITY;
