-- Add scores_data column to odds_snapshots to store ESPN API data
ALTER TABLE odds_snapshots 
ADD COLUMN scores_data jsonb;

COMMENT ON COLUMN odds_snapshots.scores_data IS 'ESPN API score and period data for debugging time period validation';