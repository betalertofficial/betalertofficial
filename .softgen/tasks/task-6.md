---
title: "Telegram Login Widget Auth"
status: "done"
priority: "high"
type: "feature"
tags: ["telegram", "auth", "login-widget"]
created_by: "agent"
created_at: "2026-05-08T02:20:58Z"
position: 6
---

## Notes
Add Telegram Login Widget for one-click authentication. Users click "Login with Telegram" button on landing page or Settings, authorize in their Telegram app, and get auto-authenticated. Cleaner UX than QR codes or manual bot commands.

## Checklist
- [x] Create `TelegramLoginButton.tsx` — widget component with auth callback
- [x] Create `/api/auth/telegram-callback` — verify hash, create/link profile
- [x] Add widget to landing page — primary auth method
- [x] Add widget to Settings — account linking for existing users
- [x] Update Profile type to include telegram fields

## Acceptance
- Click "Login with Telegram" on landing → authorize → dashboard loads
- Existing user clicks widget in Settings → Telegram connected → alerts route to Telegram
- Profile shows telegram_username and telegram_first_name after connection