CREATE TABLE IF NOT EXISTS pmc_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  anonymous_name text NOT NULL UNIQUE,
  scholar_no text NOT NULL,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS pmc_reels (
  id text PRIMARY KEY,
  creator_id text,
  created_at timestamptz NOT NULL,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS pmc_reels_created_at_idx ON pmc_reels (created_at DESC);
CREATE INDEX IF NOT EXISTS pmc_reels_creator_id_idx ON pmc_reels (creator_id);

ALTER TABLE pmc_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pmc_reels ENABLE ROW LEVEL SECURITY;
