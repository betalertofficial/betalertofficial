-- Add bookmaker column to triggers table
ALTER TABLE triggers ADD COLUMN bookmaker text NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN triggers.bookmaker IS 'The specific sportsbook/bookmaker key (e.g., draftkings, fanduel) used to filter odds data';