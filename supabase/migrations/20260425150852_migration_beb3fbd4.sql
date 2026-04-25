-- Create tracked_leagues table for admin-configured league monitoring
CREATE TABLE tracked_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_key TEXT UNIQUE NOT NULL,
  league_name TEXT NOT NULL,
  sport_category TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for tracked_leagues (admin-only access)
ALTER TABLE tracked_leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_tracked_leagues" ON tracked_leagues 
  FOR SELECT USING (true);

CREATE POLICY "admin_insert_tracked_leagues" ON tracked_leagues 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_update_tracked_leagues" ON tracked_leagues 
  FOR UPDATE USING (true);

CREATE POLICY "admin_delete_tracked_leagues" ON tracked_leagues 
  FOR DELETE USING (true);

-- Seed popular leagues
INSERT INTO tracked_leagues (league_key, league_name, sport_category, enabled) VALUES
  ('basketball_nba', 'NBA', 'basketball', true),
  ('americanfootball_nfl', 'NFL', 'americanfootball', true),
  ('baseball_mlb', 'MLB', 'baseball', true),
  ('icehockey_nhl', 'NHL', 'icehockey', true),
  ('basketball_ncaab', 'NCAA Basketball', 'basketball', false),
  ('americanfootball_ncaaf', 'NCAA Football', 'americanfootball', false);