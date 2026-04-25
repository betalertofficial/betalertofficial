---
title: Automatic CRON polling system
status: in_progress
priority: high
type: feature
tags: [cron, polling, automation]
created_by: agent
created_at: 2026-04-25T14:26:49Z
position: 1
---

## Notes

Implement smart automatic polling that respects admin settings for enable/disable and polling interval. The system runs every minute via Vercel Cron but only executes polling when enabled and interval has elapsed.

**Context:**
- `admin_settings` table has `polling_enabled` (boolean) and `polling_interval_seconds` (integer)
- `last_poll_at` column added to track last successful poll
- Vercel Cron runs at fixed 1-minute intervals (serverless limitation)
- Smart polling logic enforces interval dynamically

**Technical approach:**
- Vercel Cron hits `/api/cron/poll-triggers` every minute
- Endpoint checks settings and only runs if:
  1. `polling_enabled = true`
  2. `(now - last_poll_at) >= polling_interval_seconds`
- Updates `last_poll_at` BEFORE running (prevents concurrent runs)
- Returns skip status when conditions not met

## Checklist

- [x] Update `vercel.json` cron schedule to run every minute (`* * * * *`) pointing to `/api/cron/poll-triggers`
- [x] Modify `/api/cron/poll-triggers` endpoint to:
  - Fetch `polling_enabled`, `polling_interval_seconds`, and `last_poll_at` from admin_settings
  - Skip execution with status response if `polling_enabled = false`
  - Calculate seconds since last poll
  - Skip execution if interval not reached (return remaining time in response)
  - Update `last_poll_at` to current time BEFORE running poll
  - Run `runCronPoll()` only when all conditions met
  - Return detailed response including skip reason, interval settings, and poll results
- [x] Add debug logging showing: interval settings, last poll time, seconds elapsed, skip/run decision
- [ ] Test toggling `polling_enabled` true/false and verify polling starts/stops
- [ ] Test different `polling_interval_seconds` values (60s, 300s, etc.) and verify interval enforcement
- [ ] Verify `last_poll_at` updates correctly and prevents too-frequent runs

## Acceptance

- Toggling `polling_enabled` to false immediately stops new polling runs
- Toggling `polling_enabled` to true starts polling on next cron tick (within 1 minute)
- Setting `polling_interval_seconds = 300` means polls run ~5 minutes apart, not every minute