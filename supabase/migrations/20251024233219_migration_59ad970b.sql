-- Create a table to hold system-wide settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB
);

-- Ensure RLS is enabled
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access to settings
CREATE POLICY "Allow public read access to system settings"
ON system_settings
FOR SELECT
USING (true);

-- Allow only service_role to write to settings (protects from client-side updates)
CREATE POLICY "Allow service_role to write to system settings"
ON system_settings
FOR ALL
USING (false)
WITH CHECK (false);


-- Insert the initial setting for polling, default to 'off' (false)
-- ON CONFLICT DO NOTHING ensures we don't get an error if it already exists.
INSERT INTO system_settings (key, value)
VALUES ('polling_enabled', 'false')
ON CONFLICT (key) DO NOTHING;