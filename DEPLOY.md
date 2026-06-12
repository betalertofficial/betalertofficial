# Deployment

This app deploys to Vercel from the `main` branch.

- Requires the Vercel **Pro** plan (every-minute cron + 5-minute function duration).
- Environment variables are configured in Vercel → Project Settings → Environment Variables.
- The cron job `/api/cron/poll-triggers` runs every minute and authenticates via `CRON_SECRET`.

Last deploy trigger: 2026-06-12.
