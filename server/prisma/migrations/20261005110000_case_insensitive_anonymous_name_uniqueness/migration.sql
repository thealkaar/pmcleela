DO $$
DECLARE
    user_row RECORD;
    base_name TEXT;
    candidate_name TEXT;
    suffix INTEGER;
BEGIN
    FOR user_row IN
        SELECT id, anonymous_name, data
        FROM pmc_users
        ORDER BY id
    LOOP
        base_name := btrim(COALESCE(NULLIF(user_row.data->>'anonymousName', ''), user_row.anonymous_name));
        IF base_name = '' THEN
            base_name := 'Campus Student';
        END IF;
        candidate_name := base_name;
        suffix := 2;

        WHILE EXISTS (
            SELECT 1
            FROM pmc_users
            WHERE id <> user_row.id
              AND lower(anonymous_name) = lower(candidate_name)
        ) LOOP
            candidate_name := base_name || ' ' || suffix;
            suffix := suffix + 1;
        END LOOP;

        UPDATE pmc_users
        SET anonymous_name = lower(candidate_name),
            data = jsonb_set(data, '{anonymousName}', to_jsonb(candidate_name), true)
        WHERE id = user_row.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "pmc_users_anonymous_name_lower_key"
ON "pmc_users" (lower("anonymous_name"));
