-- Add last_poll_at to admin_settings if it doesn't exist
ALTER TABLE admin_settings 
ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN admin_settings.last_poll_at IS 'Timestamp of last successful polling execution (prevents too-frequent runs)';