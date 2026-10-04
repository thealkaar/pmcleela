CREATE TABLE "pmc_reel_reports" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "pmc_reel_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pmc_reel_reports_reel_id_reporter_id_key"
ON "pmc_reel_reports"("reel_id", "reporter_id");
CREATE INDEX "pmc_reel_reports_status_created_at_idx"
ON "pmc_reel_reports"("status", "created_at" DESC);

ALTER TABLE "pmc_reel_reports"
ADD CONSTRAINT "pmc_reel_reports_reel_id_fkey"
FOREIGN KEY ("reel_id") REFERENCES "pmc_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pmc_reel_reports"
ADD CONSTRAINT "pmc_reel_reports_reporter_id_fkey"
FOREIGN KEY ("reporter_id") REFERENCES "pmc_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
