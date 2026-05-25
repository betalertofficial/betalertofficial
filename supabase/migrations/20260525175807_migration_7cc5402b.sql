-- Step 1: Drop the FK constraint linking profiles to auth.users
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Step 2: Update profiles RLS policies to not use auth.uid()
-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Create new simple policies (profiles are public to their owners via JWT verification in app code)
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Anyone can insert profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update profiles" ON profiles FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete profiles" ON profiles FOR DELETE USING (true);

-- Step 3: Update profile_triggers policies
DROP POLICY IF EXISTS "Users can view their own triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Users can create their own triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Users can update their own triggers" ON profile_triggers;
DROP POLICY IF EXISTS "Users can delete their own triggers" ON profile_triggers;

CREATE POLICY "Anyone can manage profile_triggers" ON profile_triggers FOR ALL USING (true) WITH CHECK (true);

-- Step 4: Update alerts policies
DROP POLICY IF EXISTS "Users can view their own alerts" ON alerts;
DROP POLICY IF EXISTS "Authenticated users can create alerts" ON alerts;

CREATE POLICY "Anyone can manage alerts" ON alerts FOR ALL USING (true) WITH CHECK (true);