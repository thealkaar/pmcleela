CREATE TABLE "pmc_push_tokens" (
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pmc_push_tokens_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "pmc_push_tokens_user_id_idx" ON "pmc_push_tokens"("user_id");

ALTER TABLE "pmc_push_tokens"
ADD CONSTRAINT "pmc_push_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "pmc_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pmc_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmc_announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pmc_announcements_created_at_idx" ON "pmc_announcements"("created_at" DESC);

CREATE TABLE "pmc_app_releases" (
    "id" TEXT NOT NULL,
    "version_name" TEXT NOT NULL,
    "version_code" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmc_app_releases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pmc_app_releases_version_code_key" ON "pmc_app_releases"("version_code");
