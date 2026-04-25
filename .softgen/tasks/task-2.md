---
title: Schedule-aware polling optimization
status: in_progress
priority: high
type: feature
tags: [optimization, polling, api-efficiency]
created_by: agent
created_at: 2026-04-25T15:05:17Z
position: 2
---

## Notes

Optimize odds polling to only hit the Odds API when games are actually live, reducing wasted API calls by 80-90%. Implement two-tier system: league configuration + event schedule tracking.

**Problem:**
- Current polling hits Odds API every 60s regardless of game status
- Most calls return pregame odds that get filtered out
- Wastes API quota and $ on data we don't use

**Solution:**
- Track which leagues to monitor (NBA, NFL, etc.) in `tracked_leagues` table
- Sync event schedules periodically for tracked leagues
- Only fetch odds when events are actually live
- Skip polling entirely when no games are happening

**Technical approach:**
- `tracked_leagues`: Admin-configurable list of leagues to monitor
- `event_schedules`: Universal event tracking with status (scheduled/live/completed)
- Before fetching odds: Query for live events, only poll if they exist
- Periodic schedule sync job (daily or when no live games detected)

## Checklist

- [x] Create `tracked_leagues` table with columns:
  - `id` (UUID, primary key)
  - `league_key` (text, unique) - matches Odds API sport key (e.g., "basketball_nba", "americanfootball_nfl")
  - `league_name` (text) - display name (e.g., "NBA", "NFL")
  - `sport_category` (text) - sport type (e.g., "basketball", "americanfootball")
  - `enabled` (boolean, default true) - toggle monitoring on/off
  - `created_at`, `updated_at` timestamps
  - T1 RLS policies (admin-only access)
- [x] Create `event_schedules` table with columns:
  - `id` (UUID, primary key)
  - `event_id` (text, unique) - from Odds API
  - `league_key` (text, foreign key to tracked_leagues)
  - `sport_key` (text) - full sport key from API
  - `home_team` (text)
  - `away_team` (text)
  - `commence_time` (timestamptz)
  - `status` (text) - enum: 'scheduled', 'live', 'completed'
  - `last_checked_at` (timestamptz)
  - `created_at`, `updated_at` timestamps
  - T2 RLS policies (public read, admin write)
  - Index on (league_key, status, commence_time) for fast live event queries
- [x] Create service `scheduleService.ts` with functions:
  - `syncEventSchedules(leagueKeys: string[])` - fetch upcoming events from Odds API
  - `getActiveSports()` - query for sports with live events right now
  - `markEventsAsLive()` - update status for events where commence_time <= now
  - `markEventsAsCompleted()` - update status for events >3 hours past commence_time
- [x] Create admin endpoint `/api/admin/sync-schedules` (POST):
  - Fetches tracked leagues where `enabled = true`
  - Calls Odds API events endpoint for each league
  - Upserts into `event_schedules` with status = 'scheduled'
  - Returns count of events synced per league
- [x] Update `cronPollingService.ts` to check schedules before fetching odds:
  - Query `event_schedules` for events with status = 'live' AND commence_time <= now
  - Get distinct league_keys from results
  - Only call `fetchOddsForSport()` for leagues with live events
  - Skip Odds API entirely if no live events (log skip reason)
  - Auto-update event status (scheduled → live) based on commence_time
- [ ] Add admin UI section in Settings tab:
  - "Tracked Leagues" table showing all leagues with enable/disable toggles
  - "Sync Schedules" button to manually trigger schedule sync
  - "Event Schedules" view showing upcoming/live/completed events
  - Display last sync time and event count per league
- [ ] Seed `tracked_leagues` with popular leagues:
  - NBA: basketball_nba
  - NFL: americanfootball_nfl
  - MLB: baseball_mlb
  - NHL: icehockey_nhl
  - NCAAB: basketball_ncaab
  - NCAAF: americanfootball_ncaaf

## Acceptance

- Odds API is only called when `event_schedules` shows live events for tracked leagues
- When no games are live, polling skips Odds API entirely (visible in logs)
- Admin can toggle leagues on/off and manually sync schedules via UI
- Event status automatically transitions: scheduled → live → completed based on commence_time