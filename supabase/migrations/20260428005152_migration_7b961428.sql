-- Add time period tracking columns to triggers table
ALTER TABLE triggers 
ADD COLUMN time_period_type text NULL,
ADD COLUMN time_period_min integer NULL;

-- Add a comment explaining the columns
COMMENT ON COLUMN triggers.time_period_type IS 'Type of time period for the sport: inning (MLB), quarter (NBA/NFL), period (NHL), half (soccer)';
COMMENT ON COLUMN triggers.time_period_min IS 'Minimum time period number required for trigger to activate (e.g., 3 = 3rd quarter or later)';