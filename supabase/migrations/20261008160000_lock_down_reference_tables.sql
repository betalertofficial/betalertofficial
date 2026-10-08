-- Lock down write access on reference / system tables.
--
-- Anonymous sign-ins are enabled on this project, so policies granted to
-- `authenticated` are effectively public (anyone can get a session in one
-- request). Several tables also had writes open to `public` outright.
-- All writes to these tables come from server code using the service role
-- (cron jobs, schedule/results sync, the Telegram callback), which bypasses
-- RLS, so no browser write policies are needed. Public READ policies that the
-- dashboard relies on (teams, event_schedules, tracked_leagues, vendors,
-- vendor_team_map, game_results, system_settings) are kept.

-- admin_settings: polling on/off + interval. Server-only (poll-status API and
-- admin APIs use the service role).
drop policy if exists "Authenticated users can insert admin settings" on public.admin_settings;
drop policy if exists "Authenticated users can read admin settings" on public.admin_settings;
drop policy if exists "Authenticated users can update admin settings" on public.admin_settings;

-- event_schedules: keep public read, drop public writes.
drop policy if exists "admin_insert_event_schedules" on public.event_schedules;
drop policy if exists "admin_update_event_schedules" on public.event_schedules;
drop policy if exists "admin_delete_event_schedules" on public.event_schedules;

-- tracked_leagues: keep public read, drop public writes.
drop policy if exists "admin_insert_tracked_leagues" on public.tracked_leagues;
drop policy if exists "admin_update_tracked_leagues" on public.tracked_leagues;
drop policy if exists "admin_delete_tracked_leagues" on public.tracked_leagues;

-- teams / vendor_team_map: keep public read, drop writes.
drop policy if exists "Authenticated users can insert teams" on public.teams;
drop policy if exists "Authenticated users can update teams" on public.teams;
drop policy if exists "Authenticated users can insert vendor team mappings" on public.vendor_team_map;
drop policy if exists "Authenticated users can update vendor team mappings" on public.vendor_team_map;

-- game_opening_odds: the "service_role_all" policy was FOR ALL USING (true)
-- for everyone. Only server code reads/writes it.
drop policy if exists "service_role_all" on public.game_opening_odds;

-- odds_snapshots / trigger_matches / evaluation_runs: written and read only
-- by server code (cron, alert sender, completed-triggers API).
drop policy if exists "Authenticated users can create odds snapshots" on public.odds_snapshots;
drop policy if exists "Authenticated users can view odds snapshots" on public.odds_snapshots;
drop policy if exists "Authenticated users can create trigger matches" on public.trigger_matches;
drop policy if exists "Authenticated users can view trigger matches" on public.trigger_matches;
drop policy if exists "Allow authenticated users to read evaluation runs" on public.evaluation_runs;
