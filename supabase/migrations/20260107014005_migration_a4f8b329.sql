-- 1. Create teams table (canonical)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league TEXT NOT NULL,
  name TEXT NOT NULL,
  abbrev TEXT,
  slug TEXT NOT NULL,
  primary_color TEXT,
  secondary_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint on slug for canonical lookup
CREATE UNIQUE INDEX teams_slug_key ON teams(slug);

-- Create index on league for filtering
CREATE INDEX idx_teams_league ON teams(league);

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- RLS Policies for teams (public read, admin write)
CREATE POLICY "Anyone can view teams"
  ON teams FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert teams"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update teams"
  ON teams FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 2. Create vendor_team_map table (join table)
CREATE TABLE vendor_team_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  vendor_team_key TEXT NOT NULL,
  vendor_sport_key TEXT,
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraints
CREATE UNIQUE INDEX vendor_team_map_vendor_key_unique 
  ON vendor_team_map(vendor_id, vendor_team_key);

CREATE UNIQUE INDEX vendor_team_map_vendor_team_unique 
  ON vendor_team_map(vendor_id, team_id);

-- Indexes for query performance
CREATE INDEX idx_vendor_team_map_vendor ON vendor_team_map(vendor_id);
CREATE INDEX idx_vendor_team_map_team ON vendor_team_map(team_id);
CREATE INDEX idx_vendor_team_map_active ON vendor_team_map(is_active);

-- Enable RLS
ALTER TABLE vendor_team_map ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendor_team_map (public read, admin write)
CREATE POLICY "Anyone can view vendor team mappings"
  ON vendor_team_map FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert vendor team mappings"
  ON vendor_team_map FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update vendor team mappings"
  ON vendor_team_map FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 3. Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendor_team_map_updated_at
  BEFORE UPDATE ON vendor_team_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Insert initial vendor for theOddsAPI (if not exists)
INSERT INTO vendors (name, base_url, is_active)
VALUES ('theOddsAPI', 'https://api.the-odds-api.com/v4', true)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE teams IS 'Canonical source of truth for team data across all vendors';
COMMENT ON TABLE vendor_team_map IS 'Maps vendor-specific team keys to canonical teams';
COMMENT ON COLUMN vendor_team_map.vendor_team_key IS 'The exact team identifier used by this vendor';
COMMENT ON COLUMN vendor_team_map.vendor_sport_key IS 'Vendor-specific sport key (e.g. basketball_nba for Odds API)';