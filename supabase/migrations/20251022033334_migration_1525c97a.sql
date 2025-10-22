-- Drop existing profiles table and recreate with correct schema
DROP TABLE IF EXISTS profiles CASCADE;

-- Create profiles table with phone-based auth
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL,
  name TEXT,
  subscription_tier TEXT DEFAULT 'free',
  trigger_limit INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Create triggers table
CREATE TABLE IF NOT EXISTS triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sport TEXT NOT NULL,
  team_or_player TEXT NOT NULL,
  bet_type TEXT NOT NULL CHECK (bet_type IN ('moneyline', 'spread')),
  odds_comparator TEXT NOT NULL CHECK (odds_comparator IN ('>=', '<=', '>', '<', '==')),
  odds_value NUMERIC NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('once', 'recurring')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'deleted')),
  vendor_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;

-- Create profile_triggers junction table
CREATE TABLE IF NOT EXISTS profile_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger_id UUID NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(profile_id, trigger_id)
);

ALTER TABLE profile_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own triggers" ON profile_triggers FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users can create their own triggers" ON profile_triggers FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can delete their own triggers" ON profile_triggers FOR DELETE USING (auth.uid() = profile_id);

-- Create other tables
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  api_key TEXT,
  base_url TEXT,
  is_active BOOLEAN DEFAULT true,
  rate_limit_per_minute INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active vendors" ON vendors FOR SELECT USING (is_active = true);

-- Insert default vendor
INSERT INTO vendors (name, api_key, base_url, is_active, rate_limit_per_minute)
VALUES ('the_odds_api', '8fd23ab732557e3db9238fc571eddbbe', 'https://api.the-odds-api.com/v4', true, 500)
ON CONFLICT (name) DO UPDATE SET api_key = EXCLUDED.api_key;

CREATE TABLE IF NOT EXISTS odds_feed_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  raw_payload JSONB NOT NULL,
  event_count INTEGER,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE odds_feed_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feed_event_id UUID REFERENCES odds_feed_events(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  event_id TEXT NOT NULL,
  team_or_player TEXT NOT NULL,
  bookmaker TEXT NOT NULL CHECK (bookmaker IN ('FanDuel', 'DraftKings')),
  bet_type TEXT NOT NULL,
  odds_value NUMERIC NOT NULL,
  deep_link_url TEXT,
  commence_time TIMESTAMP WITH TIME ZONE,
  snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_lookup ON odds_snapshots (sport, team_or_player, bookmaker, snapshot_at DESC);

ALTER TABLE odds_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trigger_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_id UUID REFERENCES triggers(id) ON DELETE CASCADE,
  odds_snapshot_id UUID REFERENCES odds_snapshots(id) ON DELETE SET NULL,
  matched_value NUMERIC NOT NULL,
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE trigger_matches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_match_id UUID REFERENCES trigger_matches(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  webhook_response JSONB,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own alerts" ON alerts FOR SELECT USING (auth.uid() = profile_id);

CREATE TABLE IF NOT EXISTS vendor_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  request_url TEXT NOT NULL,
  request_method TEXT NOT NULL,
  response_status INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE vendor_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggers_evaluated INTEGER DEFAULT 0,
  matches_found INTEGER DEFAULT 0,
  alerts_sent INTEGER DEFAULT 0,
  duration_ms INTEGER,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE evaluation_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO admin_settings (setting_key, setting_value)
VALUES ('odds_polling_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;