---
title: Simplify to Telegram-only auth (remove Supabase Auth)
status: in_progress
priority: urgent
type: chore
tags: [auth, telegram, database, refactor]
created_by: agent
created_at: 2026-05-25T17:57:05Z
position: 9
---

## Notes

Current setup mixes Supabase Auth with Telegram auth, causing complexity and bugs. Simplify to Telegram-only auth.

**Key decisions:**
- Telegram is ONLY auth method (no Supabase Auth at all)
- profiles.id is just a uuid (not linked to auth.users)
- telegram_chat_id is the unique user identifier
- JWT cookie for session management
- Supabase used ONLY for database (no auth features)

**Auth flow:**
1. User clicks Telegram Login Widget
2. Backend verifies hash with bot token
3. Backend finds/creates profile by telegram_chat_id
4. Backend creates JWT with { profileId, telegramChatId }
5. Backend sets HttpOnly cookie
6. Protected routes verify JWT, extract profileId, query database

## Checklist

- [x] Create task file for tracking
- [x] Database: get current schema, identify auth.users dependencies
- [x] Database: remove profiles FK to auth.users, update RLS policies to use telegram_chat_id instead of auth.uid()
- [ ] Backend: create JWT middleware for verifying cookies in API routes
- [ ] Backend: update all API routes to use JWT verification instead of Supabase session
- [ ] Frontend: create new TelegramAuthContext (replace AuthContext with Telegram-only logic)
- [ ] Frontend: update dashboard and protected pages to use new context
- [ ] Remove: PhoneAuth.tsx component
- [ ] Remove: all Supabase auth imports (signIn, signUp, getUser, getSession)
- [ ] Test: Telegram login → dashboard loads
- [ ] Test: Create trigger works with new auth
- [ ] Test: Alerts trigger and send via Telegram

## Acceptance

1. User can log in via Telegram button, dashboard loads with their data
2. No Supabase Auth code remains (no signIn/signUp/getSession calls)
3. Protected API routes verify JWT cookie, not Supabase session