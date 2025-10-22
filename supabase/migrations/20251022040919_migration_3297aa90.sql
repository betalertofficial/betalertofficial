-- Add RLS policies for triggers table
-- Allow authenticated users to insert triggers
CREATE POLICY "Users can create triggers" ON triggers
  FOR INSERT
  WITH CHECK (true);

-- Allow viewing all triggers (needed for evaluation)
CREATE POLICY "Anyone can view triggers" ON triggers
  FOR SELECT
  USING (true);

-- Allow updates to triggers (for status changes)
CREATE POLICY "Users can update triggers" ON triggers
  FOR UPDATE
  USING (true);

-- Allow deleting triggers
CREATE POLICY "Users can delete triggers" ON triggers
  FOR DELETE
  USING (true);