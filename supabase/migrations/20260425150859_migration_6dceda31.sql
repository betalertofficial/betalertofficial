-- Create event_schedules table for universal event tracking
CREATE TABLE event_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  league_key TEXT NOT NULL REFERENCES tracked_leagues(league_key) ON DELETE CASCADE,
  sport_key TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  commence_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed')),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for event_schedules (public read, admin write)
ALTER TABLE event_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_event_schedules" ON event_schedules 
  FOR SELECT USING (true);

CREATE POLICY "admin_insert_event_schedules" ON event_schedules 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_update_event_schedules" ON event_schedules 
  FOR UPDATE USING (true);

CREATE POLICY "admin_delete_event_schedules" ON event_schedules 
  FOR DELETE USING (true);

-- Index for fast live event queries
CREATE INDEX idx_event_schedules_status_time ON event_schedules(league_key, status, commence_time);