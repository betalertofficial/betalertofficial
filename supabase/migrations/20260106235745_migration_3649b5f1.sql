-- Add RLS policies for trigger_matches table
-- Allow authenticated users to insert and view trigger matches
CREATE POLICY "Authenticated users can create trigger matches" 
ON trigger_matches 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can view trigger matches" 
ON trigger_matches 
FOR SELECT 
TO authenticated 
USING (true);