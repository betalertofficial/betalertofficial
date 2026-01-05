-- Create INSERT policy for alerts table (allow authenticated users to insert)
CREATE POLICY "Authenticated users can create alerts"
  ON alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create INSERT policy for odds_snapshots (allow authenticated users to insert)
CREATE POLICY "Authenticated users can create odds snapshots"
  ON odds_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create SELECT policy for odds_snapshots (allow authenticated users to view)
CREATE POLICY "Authenticated users can view odds snapshots"
  ON odds_snapshots
  FOR SELECT
  TO authenticated
  USING (true);