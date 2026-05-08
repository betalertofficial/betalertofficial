---
title: "Connect Telegram to Existing Accounts"
status: "done"
priority: "medium"
type: "feature"
tags: ["telegram", "account-linking", "settings"]
created_by: "agent"
created_at: "2026-05-08T02:20:58Z"
position: 7
---

## Notes
Let existing users (who may have created account via anonymous auth) connect their Telegram account from Settings page. Links telegram_chat_id to their profile so they get alerts via Telegram instead of fallback methods.

## Checklist
- [x] Add "Connect Telegram" section to Settings page
- [x] Use TelegramLoginButton widget in Settings
- [x] Handle linking via telegram-callback endpoint
- [x] Show connection status (connected/not connected)
- [x] Display telegram_username and telegram_first_name when connected

## Acceptance
- Anonymous user connects Telegram → profile updated with telegram_chat_id
- Settings shows connected Telegram username
- Alerts now go to Telegram instead of Zapier