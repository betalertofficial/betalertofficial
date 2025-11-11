-- Add event_data column to odds_snapshots for storing complete event JSON
ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS event_data JSONB;

-- Add comment explaining the column
COMMENT ON COLUMN odds_snapshots.event_data IS 'Complete JSON data from The Odds API for this event, including all bookmakers and markets';