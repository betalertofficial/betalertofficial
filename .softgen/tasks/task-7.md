---
title: "Connect Telegram to Existing Accounts"
status: "todo"
priority: "medium"
type: "feature"
tags: ["telegram", "settings", "linking"]
created_by: "agent"
created_at: "2026-05-08T02:20:58Z"
position: 7
---

## Notes
Let existing phone auth users link their Telegram account. Add "Connect Telegram" button in Settings. Generates a unique link code, user opens bot, enters code, bot links telegram_chat_id to their profile.

## Checklist
- [ ] Add "Connect Telegram" button in Settings.tsx
- [ ] Generate unique 6-digit code stored in profiles (telegram_link_code, expires_at)
- [ ] Bot handles `/link CODE` command — matches code to profile, updates telegram_chat_id
- [ ] Show connected status in Settings (username, option to disconnect)
- [ ] Expire link codes after 5 minutes

## Acceptance
- Phone user clicks "Connect Telegram", gets code
- Opens bot, sends /link CODE, gets confirmation
- Settings shows connected Telegram username
- Alerts now go to Telegram instead of Zapier