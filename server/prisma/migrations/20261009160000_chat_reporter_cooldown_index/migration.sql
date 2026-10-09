CREATE INDEX "pmc_chat_reports_reporter_created_at_idx"
ON "pmc_chat_reports"("reporter_id", "created_at" DESC);
