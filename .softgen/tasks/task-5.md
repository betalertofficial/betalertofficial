---
title: "Telegram Alert Notifications"
status: "done"
priority: "high"
type: "feature"
tags: ["telegram", "alerts", "notifications"]
created_by: "agent"
created_at: "2026-05-08T02:20:58Z"
position: 5
---

## Notes
Add Telegram as primary notification channel. When trigger fires, check for telegram_chat_id first. If present, send via Telegram API. If not, fall back to Zapier webhook (existing behavior).

## Checklist
- [x] Create `telegramService.ts` — sendMessage via Telegram Bot API
- [x] Update `alertService.ts` — check telegram_chat_id, route to Telegram or Zapier
- [x] Format alert message for Telegram (Markdown support)
- [x] Add error handling (retry logic, fallback to Zapier on failure)
- [x] Update evaluate-triggers cron to use new routing

## Acceptance
- User with telegram_chat_id gets alerts via Telegram
- User without telegram_chat_id gets alerts via Zapier (existing flow)
- Alert format looks good in Telegram app