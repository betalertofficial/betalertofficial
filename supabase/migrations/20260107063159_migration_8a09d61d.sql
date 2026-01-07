-- Create RLS policies for admin_settings table
-- Allow authenticated users to read admin settings
CREATE POLICY "Authenticated users can read admin settings" 
ON admin_settings FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to update admin settings (for admins)
CREATE POLICY "Authenticated users can update admin settings" 
ON admin_settings FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Allow authenticated users to insert admin settings
CREATE POLICY "Authenticated users can insert admin settings" 
ON admin_settings FOR INSERT 
TO authenticated 
WITH CHECK (true);