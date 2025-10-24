-- Clean up all RLS policies and create a fresh, working set

-- First, remove ALL existing policies on both tables to start fresh
DROP POLICY IF EXISTS "Allow authenticated users to create profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Allow authenticated users to view profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Allow authenticated users to update profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Allow authenticated users to delete profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Anyone can create profile_triggers" ON profile_triggers;

DROP POLICY IF EXISTS "Allow authenticated users to create triggers" ON triggers;
DROP POLICY IF EXISTS "Allow authenticated users to view triggers" ON triggers;
DROP POLICY IF EXISTS "Allow authenticated users to update triggers" ON triggers;
DROP POLICY IF EXISTS "Allow authenticated users to delete triggers" ON triggers;

-- Now create simple, permissive policies for both tables
-- These allow ANY authenticated user to do ANY operation
CREATE POLICY "authenticated_users_all_operations" ON triggers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_users_all_operations" ON profile_triggers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify RLS is enabled on both tables
ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_triggers ENABLE ROW LEVEL SECURITY;

-- Check the final state
SELECT 
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename IN ('triggers', 'profile_triggers')
ORDER BY tablename, policyname;