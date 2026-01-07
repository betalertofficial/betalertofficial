-- Alter the admin_settings table to use text instead of jsonb for setting_value
ALTER TABLE admin_settings ALTER COLUMN setting_value TYPE text USING setting_value::text;

-- Insert the initial polling configuration settings
INSERT INTO admin_settings (setting_key, setting_value)
VALUES 
  ('odds_polling_status', 'true'),
  ('polling_interval_seconds', '30'),
  ('max_polling_api_per_hour', '120')
ON CONFLICT (setting_key) 
DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = now();