-- Add Telegram fields to profiles (if not already added)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
ADD COLUMN IF NOT EXISTS telegram_username TEXT,
ADD COLUMN IF NOT EXISTS telegram_first_name TEXT;

-- Make telegram_chat_id unique
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_telegram_chat_id_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_telegram_chat_id_key UNIQUE (telegram_chat_id);
  END IF;
END $$;

-- Create index for fast telegram_chat_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id ON profiles(telegram_chat_id);