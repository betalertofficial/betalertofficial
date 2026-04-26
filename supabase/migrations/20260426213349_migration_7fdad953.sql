-- Add public read policy for vendors table
DROP POLICY IF EXISTS "public_read_vendors" ON vendors;
CREATE POLICY "public_read_vendors" ON vendors 
  FOR SELECT 
  USING (true);