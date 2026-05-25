-- Drop the existing authenticated-only policy
DROP POLICY IF EXISTS "allow_all_authenticated" ON triggers;

-- Create new policy that allows anyone to manage triggers
CREATE POLICY "anyone_can_manage_triggers" ON triggers
  FOR ALL
  USING (true)
  WITH CHECK (true);