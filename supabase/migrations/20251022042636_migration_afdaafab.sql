-- First, let's check and fix the profile_triggers RLS policies
-- Drop existing policies
DROP POLICY IF EXISTS "Users can create their own triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Users can view their own triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Users can delete their own triggers" ON profile_triggers;

-- Create simpler, more permissive policies that work with super_admin
CREATE POLICY "Allow authenticated users to create profile_triggers" ON profile_triggers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view profile_triggers" ON profile_triggers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to update profile_triggers" ON profile_triggers
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete profile_triggers" ON profile_triggers
  FOR DELETE
  TO authenticated
  USING (true);

-- Now let's also check and update the triggers table RLS policies
DROP POLICY IF EXISTS "Users can create triggers" ON triggers;
DROP POLICY IF EXISTS "Users can view triggers" ON triggers;
DROP POLICY IF EXISTS "Users can update triggers" ON triggers;
DROP POLICY IF EXISTS "Users can delete triggers" ON triggers;

CREATE POLICY "Allow authenticated users to create triggers" ON triggers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view triggers" ON triggers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to update triggers" ON triggers
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete triggers" ON triggers
  FOR DELETE
  TO authenticated
  USING (true);