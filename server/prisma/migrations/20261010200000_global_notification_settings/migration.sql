CREATE TABLE "pmc_app_settings" (
    "id" TEXT NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pmc_app_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "pmc_app_settings" ("id", "notifications_enabled")
VALUES ('global', true);
