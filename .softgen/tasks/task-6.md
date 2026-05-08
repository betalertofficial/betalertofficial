---
title: "Telegram Web App Auth"
status: "todo"
priority: "high"
type: "feature"
tags: ["telegram", "auth", "webapp"]
created_by: "agent"
created_at: "2026-05-08T02:20:58Z"
position: 6
---

## Notes
Add Telegram as an auth option. Detect `window.Telegram.WebApp` on frontend. If present, auto-authenticate via telegram_chat_id. If not, show existing Supabase phone auth flow. Configure menu button via BotFather to launch dashboard.

## Checklist
- [ ] Detect Telegram Web App environment in AuthContext
- [ ] Auto-authenticate via telegram_chat_id when inside Telegram
- [ ] Update login flow to show Telegram or phone auth based on context
- [ ] Add menu button config to BotFather (setMenuButton)
- [ ] Test in Telegram app and regular browser

## Acceptance
- Dashboard opens from Telegram bot menu button
- Auto-authenticates without phone number prompt
- Regular browser still shows phone auth
- Auth state persists across navigation