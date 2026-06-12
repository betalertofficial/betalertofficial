-- ============================================================================
-- SECURITY LOCKDOWN MIGRATION
-- ============================================================================
-- Context: the app ships the Supabase ANON key in the browser and queries the
-- DB directly. RLS policies were left wide open (USING(true)) during softgen
-- development, and `profiles.role` is client-updatable -> anyone can read/modify
-- all data and self-promote to admin.
--
-- This file has TWO parts:
--   PART 1 — Safe to apply NOW. Does not break the running app. Stops the worst
--            problems: privilege escalation, the exposed vendor API key, and
--            client writes to server-only/config tables.
--   PART 2 — Apply only AFTER the matching code PR is merged. It fully isolates
--            user data, but REQUIRES that client-side reads/writes of those
--            tables move behind authenticated API routes first (otherwise the
--            live app will lose access). Read the notes in Part 2.
--
-- How to run: paste into the Supabase Dashboard -> SQL Editor and run, or place
-- in supabase/migrations and `supabase db push`.
-- ============================================================================


-- ============================================================================
-- PART 1 — APPLY NOW (non-breaking)
-- ============================================================================

-- 1A. Stop privilege escalation -------------------------------------------------
-- Prevent anyone coming through the public API (anon/authenticated roles) from
-- changing privileged columns on their own profile. The service-role key (used
-- by the server, e.g. admin-login) bypasses this and can still set roles.
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted backends may change privileged fields.
  IF current_user IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.trigger_limit IS DISTINCT FROM OLD.trigger_limit THEN
    RAISE EXCEPTION 'Not allowed to modify role / subscription_tier / trigger_limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_privilege_lock ON public.profiles;
CREATE TRIGGER trg_enforce_profile_privilege_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_lock();


-- 1B. Neutralize the exposed vendor API key ------------------------------------
-- A live Odds API key was stored (and world-readable) in vendors.api_key. After
-- you have ROTATED that key at the provider and the app reads ODDS_API_KEY from
-- the environment (this PR), wipe the stored secret. The app no longer reads it.
UPDATE public.vendors SET api_key = NULL;


-- 1C. Make server-only / config tables read-only to clients --------------------
-- These tables are only ever written by the server (service-role) via API
-- routes (admin/polling, admin/sync-schedules, admin/map-nba-teams, the cron).
-- Removing INSERT/UPDATE/DELETE from the public roles blocks tampering while
-- leaving SELECT (display) working. service_role is unaffected.
REVOKE INSERT, UPDATE, DELETE ON public.admin_settings    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.trigger_matches   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_schedules   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tracked_leagues   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.teams             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vendor_team_map   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_opening_odds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vendors           FROM anon, authenticated;

-- Hide the vendors table from the browser entirely (it holds vendor config /
-- the now-nulled key). Vendor data the app needs should be read server-side.
REVOKE SELECT ON public.vendors FROM anon, authenticated;


-- ============================================================================
-- PART 2 — APPLY AFTER THE CODE PR IS MERGED  (DO NOT RUN BLINDLY)
-- ============================================================================
-- The tables below (profiles, triggers, profile_triggers, alerts, trigger_matches)
-- are currently read/written DIRECTLY from the browser with the anon key. The
-- app authenticates with a custom Telegram JWT (NOT Supabase Auth), so for many
-- users `auth.uid()` is NULL — which means owner-scoped RLS based on auth.uid()
-- will BLOCK those users and break the app.
--
-- The correct end state: move all reads/writes of these tables into server-side
-- API routes that verify the JWT and use the service-role client, then lock the
-- tables to "service role only" for the public roles. Once the client no longer
-- touches these tables directly, uncomment and run the block below.
--
-- ---------------------------------------------------------------------------
-- -- profiles: clients may read nothing directly; all access via API routes.
-- DROP POLICY IF EXISTS "Anyone can read profiles"   ON public.profiles;
-- DROP POLICY IF EXISTS "Anyone can insert profiles" ON public.profiles;
-- DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
-- DROP POLICY IF EXISTS "Anyone can delete profiles" ON public.profiles;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
--
-- -- triggers / profile_triggers / alerts: same treatment.
-- DROP POLICY IF EXISTS "anyone_can_manage_triggers" ON public.triggers;
-- DROP POLICY IF EXISTS "Anyone can manage alerts"    ON public.alerts;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.triggers         FROM anon, authenticated;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profile_triggers FROM anon, authenticated;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.alerts           FROM anon, authenticated;
-- REVOKE SELECT ON public.trigger_matches FROM anon, authenticated;
-- ---------------------------------------------------------------------------
--
-- ALTERNATIVE (if you migrate to Supabase Auth so auth.uid() = profiles.id):
-- replace the REVOKEs above with owner-scoped policies, e.g.:
--   CREATE POLICY own_profile ON public.profiles
--     FOR SELECT TO authenticated USING (auth.uid() = id);
--   CREATE POLICY own_alerts ON public.alerts
--     FOR SELECT TO authenticated USING (auth.uid() = profile_id);
-- ============================================================================
