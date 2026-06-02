-- Stores the pre-game (opening) moneyline odds for every game we see.
-- event_id is the primary key so each game gets exactly one row, written once
-- and never updated — these are immutable opening lines.
CREATE TABLE IF NOT EXISTS game_opening_odds (
  event_id       TEXT PRIMARY KEY,
  sport          TEXT NOT NULL,
  home_team      TEXT NOT NULL,
  away_team      TEXT NOT NULL,
  commence_time  TIMESTAMPTZ NOT NULL,
  home_ml        INTEGER,
  away_ml        INTEGER,
  bookmaker      TEXT,
  captured_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_opening_odds_sport
  ON game_opening_odds(sport);

CREATE INDEX IF NOT EXISTS idx_game_opening_odds_commence
  ON game_opening_odds(commence_time DESC);

ALTER TABLE game_opening_odds ENABLE ROW LEVEL SECURITY;

-- Service role (cron) can write; authenticated users can read for the dashboard.
CREATE POLICY "service_role_all" ON game_opening_odds
  FOR ALL USING (true) WITH CHECK (true);
