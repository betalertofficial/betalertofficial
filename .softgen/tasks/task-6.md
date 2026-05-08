---
title: "Telegram Web App Auth"
status: "done"
priority: "high"
type: "feature"
tags: ["telegram", "auth", "webapp"]
created_by: "agent"
created_at: "2026-05-08T02:20:58Z"
position: 6
---

## Notes
Add Telegram Web App as an auth method. Detect `window.Telegram.WebApp` on frontend. If present, auto-authenticate via `telegram_chat_id`. If not, show existing phone auth. Add menu button in bot via BotFather.

## Checklist
- [x] Create `telegramAuthService.ts` — detect WebApp, parse user data
- [x] Update `AuthContext.tsx` — check for Telegram WebApp on mount, auto-login
- [x] Add QR code to landing page — links to @Hammer_notifs_bot
- [x] Handle auth state persistence across navigation
- [x] Add fallback to existing phone auth when not in Telegram

## Acceptance
- Open bot menu button, dashboard loads without phone number prompt
- Regular browser still shows phone auth
- Auth state persists across navigation