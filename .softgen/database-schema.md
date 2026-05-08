# Database Schema Documentation

Generated: 2026-05-05

## Tables Overview

16 tables in public schema:
- `alerts` - Alert notifications sent to users
- `profiles` - User profile data
- `profile_triggers` - User-trigger associations
- `teams` - Canonical team data
- `vendor_team_map` - Maps vendor team identifiers to canonical teams
- `triggers` - User-defined betting triggers
- `vendors` - External data vendor configurations
- `odds_feed_events` - Raw odds API responses
- `odds_snapshots` - Individual odds data points
- `trigger_matches` - Matched trigger instances
- `vendor_logs` - API request/response logs
- `evaluation_runs` - Cron job execution history
- `admin_settings` - Admin configuration key-value pairs
- `tracked_leagues` - Enabled sports leagues
- `system_settings` - System-wide configuration
- `event_schedules` - Upcoming game schedules

---

## Complete Schema DDL

```sql
-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
CREATE TABLE profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_e164 text UNIQUE,
    country_code text,
    name text,
    subscription_tier text DEFAULT 'free',
    trigger_limit integer DEFAULT 3,
    role text DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_profiles_role ON profiles(role);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- ============================================================================
-- VENDORS TABLE
-- ============================================================================
CREATE TABLE vendors (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text UNIQUE NOT NULL,
    api_key text,
    base_url text,
    is_active boolean DEFAULT true,
    rate_limit_per_minute integer,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active vendors"
    ON vendors FOR SELECT
    USING (is_active = true);

CREATE POLICY "public_read_vendors"
    ON vendors FOR SELECT
    USING (true);

-- ============================================================================
-- TEAMS TABLE (Canonical team data)
-- ============================================================================
CREATE TABLE teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    league text NOT NULL,
    name text NOT NULL,
    abbrev text,
    slug text UNIQUE NOT NULL,
    primary_color text,
    secondary_color text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE teams IS 'Canonical source of truth for team data across all vendors';

CREATE INDEX idx_teams_league ON teams(league);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view teams"
    ON teams FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can insert teams"
    ON teams FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update teams"
    ON teams FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- VENDOR_TEAM_MAP TABLE
-- ============================================================================
CREATE TABLE vendor_team_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    vendor_team_key text NOT NULL,
    vendor_sport_key text,
    is_active boolean DEFAULT true,
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(vendor_id, vendor_team_key),
    UNIQUE(vendor_id, team_id)
);

COMMENT ON TABLE vendor_team_map IS 'Maps vendor-specific team keys to canonical teams';
COMMENT ON COLUMN vendor_team_map.vendor_team_key IS 'The exact team identifier used by this vendor';
COMMENT ON COLUMN vendor_team_map.vendor_sport_key IS 'Vendor-specific sport key (e.g. basketball_nba for Odds API)';

CREATE INDEX idx_vendor_team_map_vendor ON vendor_team_map(vendor_id);
CREATE INDEX idx_vendor_team_map_team ON vendor_team_map(team_id);
CREATE INDEX idx_vendor_team_map_active ON vendor_team_map(is_active);

ALTER TABLE vendor_team_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view vendor team mappings"
    ON vendor_team_map FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can insert vendor team mappings"
    ON vendor_team_map FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update vendor team mappings"
    ON vendor_team_map FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- TRACKED_LEAGUES TABLE
-- ============================================================================
CREATE TABLE tracked_leagues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    league_key text UNIQUE NOT NULL,
    league_name text NOT NULL,
    sport_category text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE tracked_leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_tracked_leagues"
    ON tracked_leagues FOR SELECT
    USING (true);

CREATE POLICY "admin_insert_tracked_leagues"
    ON tracked_leagues FOR INSERT
    WITH CHECK (true);

CREATE POLICY "admin_update_tracked_leagues"
    ON tracked_leagues FOR UPDATE
    USING (true);

CREATE POLICY "admin_delete_tracked_leagues"
    ON tracked_leagues FOR DELETE
    USING (true);

-- ============================================================================
-- EVENT_SCHEDULES TABLE
-- ============================================================================
CREATE TABLE event_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id text UNIQUE NOT NULL,
    league_key text NOT NULL REFERENCES tracked_leagues(league_key) ON DELETE CASCADE,
    sport_key text NOT NULL,
    home_team text NOT NULL,
    away_team text NOT NULL,
    commence_time timestamp with time zone NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed')),
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_event_schedules_status_time ON event_schedules(league_key, status, commence_time);

ALTER TABLE event_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_event_schedules"
    ON event_schedules FOR SELECT
    USING (true);

CREATE POLICY "admin_insert_event_schedules"
    ON event_schedules FOR INSERT
    WITH CHECK (true);

CREATE POLICY "admin_update_event_schedules"
    ON event_schedules FOR UPDATE
    USING (true);

CREATE POLICY "admin_delete_event_schedules"
    ON event_schedules FOR DELETE
    USING (true);

-- ============================================================================
-- TRIGGERS TABLE
-- ============================================================================
CREATE TABLE triggers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    sport text NOT NULL,
    team_or_player text NOT NULL,
    bet_type text NOT NULL CHECK (bet_type IN ('moneyline', 'spread')),
    odds_comparator text NOT NULL CHECK (odds_comparator IN ('>=', '<=', '>', '<', '==')),
    odds_value numeric NOT NULL,
    frequency text NOT NULL CHECK (frequency IN ('once', 'recurring')),
    status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'deleted')),
    bookmaker text,
    team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
    time_period_type text,
    time_period_min integer,
    vendor_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

COMMENT ON COLUMN triggers.bookmaker IS 'The specific sportsbook/bookmaker key (e.g., draftkings, fanduel) used to filter odds data';
COMMENT ON COLUMN triggers.team_id IS 'Reference to the team this trigger is monitoring';
COMMENT ON COLUMN triggers.time_period_type IS 'Type of time period for the sport: inning (MLB), quarter (NBA/NFL), period (NHL), half (soccer)';
COMMENT ON COLUMN triggers.time_period_min IS 'Minimum time period number required for trigger to activate (e.g., 3 = 3rd quarter or later)';

CREATE INDEX idx_triggers_team_id ON triggers(team_id);

ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated"
    ON triggers FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- PROFILE_TRIGGERS TABLE (Junction)
-- ============================================================================
CREATE TABLE profile_triggers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    trigger_id uuid NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(profile_id, trigger_id)
);

ALTER TABLE profile_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own triggers"
    ON profile_triggers FOR SELECT
    USING (profile_id = auth.uid());

CREATE POLICY "Users can create their own triggers"
    ON profile_triggers FOR INSERT
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update their own triggers"
    ON profile_triggers FOR UPDATE
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can delete their own triggers"
    ON profile_triggers FOR DELETE
    USING (profile_id = auth.uid());

-- ============================================================================
-- ODDS_FEED_EVENTS TABLE
-- ============================================================================
CREATE TABLE odds_feed_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
    raw_payload jsonb NOT NULL,
    event_count integer,
    fetched_at timestamp with time zone DEFAULT now()
);

ALTER TABLE odds_feed_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ODDS_SNAPSHOTS TABLE
-- ============================================================================
CREATE TABLE odds_snapshots (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    feed_event_id uuid REFERENCES odds_feed_events(id) ON DELETE CASCADE,
    sport text NOT NULL,
    event_id text NOT NULL,
    team_or_player text NOT NULL,
    bookmaker text NOT NULL CHECK (bookmaker IN ('FanDuel', 'DraftKings')),
    bet_type text NOT NULL,
    odds_value numeric NOT NULL,
    deep_link_url text,
    commence_time timestamp with time zone,
    event_data jsonb,
    scores_data jsonb,
    snapshot_at timestamp with time zone DEFAULT now()
);

COMMENT ON COLUMN odds_snapshots.event_data IS 'Complete JSON data from The Odds API for this event, including all bookmakers and markets';
COMMENT ON COLUMN odds_snapshots.scores_data IS 'ESPN API score and period data for debugging time period validation';

CREATE INDEX idx_odds_snapshots_lookup ON odds_snapshots(sport, team_or_player, bookmaker, snapshot_at DESC);

ALTER TABLE odds_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view odds snapshots"
    ON odds_snapshots FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create odds snapshots"
    ON odds_snapshots FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- TRIGGER_MATCHES TABLE
-- ============================================================================
CREATE TABLE trigger_matches (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_id uuid REFERENCES triggers(id) ON DELETE CASCADE,
    odds_snapshot_id uuid REFERENCES odds_snapshots(id) ON DELETE SET NULL,
    matched_value numeric NOT NULL,
    matched_at timestamp with time zone DEFAULT now()
);

ALTER TABLE trigger_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view trigger matches"
    ON trigger_matches FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create trigger matches"
    ON trigger_matches FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- ALERTS TABLE
-- ============================================================================
CREATE TABLE alerts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_match_id uuid REFERENCES trigger_matches(id) ON DELETE CASCADE,
    profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    message text NOT NULL,
    delivery_status text DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
    webhook_response jsonb,
    sent_at timestamp with time zone,
    game_status text,
    game_detail text,
    home_team text,
    away_team text,
    home_score integer,
    away_score integer,
    period integer,
    clock text,
    score_summary text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alerts"
    ON alerts FOR SELECT
    USING (auth.uid() = profile_id);

CREATE POLICY "Authenticated users can create alerts"
    ON alerts FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- VENDOR_LOGS TABLE
-- ============================================================================
CREATE TABLE vendor_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
    request_url text NOT NULL,
    request_method text NOT NULL,
    response_status integer,
    response_time_ms integer,
    error_message text,
    logged_at timestamp with time zone DEFAULT now()
);

ALTER TABLE vendor_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- EVALUATION_RUNS TABLE
-- ============================================================================
CREATE TABLE evaluation_runs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    triggers_evaluated integer DEFAULT 0,
    matches_found integer DEFAULT 0,
    alerts_sent integer DEFAULT 0,
    duration_ms integer,
    status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);

ALTER TABLE evaluation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read evaluation runs"
    ON evaluation_runs FOR SELECT
    USING (auth.role() = 'authenticated');

-- ============================================================================
-- ADMIN_SETTINGS TABLE
-- ============================================================================
CREATE TABLE admin_settings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key text UNIQUE NOT NULL,
    setting_value text NOT NULL,
    last_poll_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);

COMMENT ON COLUMN admin_settings.last_poll_at IS 'Timestamp of last successful polling execution (prevents too-frequent runs)';

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read admin settings"
    ON admin_settings FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert admin settings"
    ON admin_settings FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update admin settings"
    ON admin_settings FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- SYSTEM_SETTINGS TABLE
-- ============================================================================
CREATE TABLE system_settings (
    key text PRIMARY KEY,
    value jsonb,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to system settings"
    ON system_settings FOR SELECT
    USING (true);

CREATE POLICY "Allow service_role to write to system settings"
    ON system_settings FOR ALL
    USING (false)
    WITH CHECK (false);
```

---

## Key Relationships

1. **User → Triggers**: `profiles` ← `profile_triggers` → `triggers`
2. **Triggers → Matches**: `triggers` ← `trigger_matches` → `odds_snapshots`
3. **Matches → Alerts**: `trigger_matches` ← `alerts` → `profiles`
4. **Teams → Triggers**: `teams` ← `triggers` (optional FK)
5. **Vendors → Team Mappings**: `vendors` ← `vendor_team_map` → `teams`
6. **Odds Data Flow**: `vendors` → `odds_feed_events` → `odds_snapshots`
7. **Schedules**: `tracked_leagues` ← `event_schedules`

---

## Notes

- All tables have RLS enabled
- Most authenticated operations use `auth.uid()` or `auth.role()`
- Time period filtering added for triggers (quarter/inning/period)
- Team normalization via `teams` table with vendor mappings
- Comprehensive event scheduling system for efficient polling