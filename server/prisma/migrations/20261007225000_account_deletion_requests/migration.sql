CREATE TABLE "pmc_student_identities" (
    "email" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmc_student_identities_pkey" PRIMARY KEY ("email")
);

INSERT INTO "pmc_student_identities" ("email", "gender")
SELECT lower("email"), COALESCE("data"->>'gender', 'male')
FROM "pmc_users"
ON CONFLICT ("email") DO NOTHING;

CREATE TABLE "pmc_account_deletion_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delete_after" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "pmc_account_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pmc_account_deletion_requests_status_due_idx"
ON "pmc_account_deletion_requests"("status", "delete_after");

CREATE UNIQUE INDEX "pmc_account_deletion_requests_one_pending_per_user_key"
ON "pmc_account_deletion_requests"("user_id")
WHERE "status" = 'pending';
