-- Add role column to profiles table to distinguish between regular users and admins
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Add check constraint to ensure valid roles
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('user', 'admin', 'super_admin'));

-- Create an index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);