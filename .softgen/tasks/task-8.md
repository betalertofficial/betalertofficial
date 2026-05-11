---
title: Telegram JWT Auth System
status: todo
priority: urgent
type: feature
tags: [auth, telegram, jwt]
created_by: agent
created_at: 2026-05-11T01:17:22Z
position: 8
---

## Notes

Replace anonymous Supabase sessions with custom JWT authentication for Telegram users.

**Problem:** Current flow tries to use Supabase Auth for Telegram users, causing infinite spinner because:
- Telegram users don't have `auth.users` entries
- `auth.uid()` returns NULL
- RLS policies block profile queries
- Anonymous sessions create new UUIDs each login (user loses triggers)

**Solution:** Separate auth systems:
- **Telegram users:** Custom JWT in HttpOnly cookie → profiles table only
- **Phone users:** Existing Supabase session → auth.users + profiles
- **Unified:** Both resolve to profiles table via session API

**Architecture:**
```
Login via Telegram → /api/auth/telegram-callback → Issue JWT cookie → /dashboard
Login via Phone → Supabase Auth → Session token → /dashboard
Dashboard → /api/auth/session → Returns profile (checks both auth methods)
```

**Technical details:**
- JWT payload: `{ userId, telegramChatId, telegramUsername, telegramFirstName, authMethod: 'telegram' }`
- Cookie: `telegram_session`, HttpOnly, 30-day expiry
- Session API: Check JWT cookie first, fallback to Supabase Auth header
- RLS: Use service role for Telegram queries (bypass `auth.uid()` requirement)

## Checklist

- [x] Install `jsonwebtoken` package and add `cookie` package
- [x] Add `JWT_SECRET` environment variable (generate secure random string)
- [x] Create `src/lib/jwt.ts` with JWT sign/verify utilities
- [x] Update `/api/auth/telegram-callback.ts` to issue JWT cookie instead of creating Supabase session
- [x] Create `/api/auth/session.ts` unified session endpoint (checks JWT + Supabase)
- [x] Update `AuthContext.tsx` to call session API instead of direct Supabase auth
- [ ] Update profile queries to use service role for Telegram users (bypass RLS)
- [ ] Test: Fresh Telegram login creates profile + JWT cookie + loads dashboard
- [ ] Test: Existing Telegram user logs in, keeps same UUID, sees existing triggers
- [ ] Test: Phone auth users still work unchanged
- [ ] Remove anonymous auth calls completely

## Acceptance

- Telegram login loads dashboard without infinite spinner
- Existing Telegram users retain same profile ID across logins
- Phone auth continues working unchanged
- User can create triggers and see them on next login (via Telegram)
