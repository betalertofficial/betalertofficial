-- First, let's update the RLS policies to be simpler and more permissive for authenticated users
-- This will allow any authenticated user (including our super admin) to perform CRUD operations

-- Drop all existing conflicting policies on triggers table
DROP POLICY IF EXISTS "authenticated_users_all_operations" ON triggers;
DROP POLICY IF EXISTS "super_admin_all_access" ON triggers;
DROP POLICY IF EXISTS "authenticated_users_all_access" ON triggers;
DROP POLICY IF EXISTS "Anyone can create triggers" ON triggers;
DROP POLICY IF EXISTS "Anyone can view triggers" ON triggers;
DROP POLICY IF EXISTS "Allow authenticated users to create triggers" ON triggers;
DROP POLICY IF EXISTS "Allow authenticated users to view triggers" ON triggers;
DROP POLICY IF EXISTS "Allow authenticated users to update triggers" ON triggers;
DROP POLICY IF EXISTS "Allow authenticated users to delete triggers" ON triggers;

-- Drop all existing conflicting policies on profile_triggers table
DROP POLICY IF EXISTS "authenticated_users_all_operations" ON profile_triggers;
DROP POLICY IF EXISTS "super_admin_all_access" ON profile_triggers;
DROP POLICY IF EXISTS "authenticated_users_all_access" ON profile_triggers;
DROP POLICY IF EXISTS "Anyone can create profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Allow authenticated users to create profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Allow authenticated users to view profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Allow authenticated users to update profile_triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Allow authenticated users to delete profile_triggers" ON profile_triggers;

-- Create single comprehensive policies for both tables
-- These allow ANY authenticated user to do ANYTHING
CREATE POLICY "allow_all_authenticated" ON triggers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated" ON profile_triggers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify the policies
SELECT 
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename IN ('triggers', 'profile_triggers')
ORDER BY tablename, policyname;