-- Drop existing policies for profile_triggers
DROP POLICY IF EXISTS "Users can create their own triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Users can view their own triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Users can delete their own triggers" ON profile_triggers;

-- Create new policies that allow super_admin bypass
CREATE POLICY "Users can create their own triggers" ON profile_triggers
  FOR INSERT
  WITH CHECK (
    auth.uid() = profile_id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can view their own triggers" ON profile_triggers
  FOR SELECT
  USING (
    auth.uid() = profile_id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Users can delete their own triggers" ON profile_triggers
  FOR DELETE
  USING (
    auth.uid() = profile_id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'super_admin'
    )
  );