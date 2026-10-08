-- Lock down triggers, profile_triggers and alerts.
--
-- Each had a single "anyone can manage" policy (FOR ALL USING true), so the
-- public anon key could read, edit or delete every user's triggers, owner
-- links and alert history. All app access now goes through server routes
-- (/api/triggers, /api/triggers/[id], /api/triggers/confirm,
-- /api/user/completed-triggers, the cron and alert sender) using the service
-- role, which bypasses RLS. No browser policies remain.

drop policy if exists "anyone_can_manage_triggers" on public.triggers;
drop policy if exists "Anyone can manage profile_triggers" on public.profile_triggers;
drop policy if exists "Anyone can manage alerts" on public.alerts;

alter table public.triggers enable row level security;
alter table public.profile_triggers enable row level security;
alter table public.alerts enable row level security;
