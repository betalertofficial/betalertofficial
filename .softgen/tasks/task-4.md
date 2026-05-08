---
title: "Telegram Database Schema"
status: "done"
priority: "urgent"
type: "feature"
tags: ["database", "telegram", "profiles"]
created_by: "agent"
created_at: "2026-05-08T02:20:58Z"
position: 4
---

## Notes
Add Telegram fields to profiles table alongside existing phone auth columns. Keep existing fields intact — Telegram is additive, not a replacement.

## Checklist
- [x] Add `telegram_chat_id` (TEXT, unique, nullable) to profiles
- [x] Add `telegram_username` (TEXT, nullable) to profiles
- [x] Add `telegram_first_name` (TEXT, nullable) to profiles
- [x] Update RLS policies to allow upserts by telegram_chat_id
- [x] Create index on telegram_chat_id for fast lookups

## Acceptance
- Bot can create/update profiles with telegram_chat_id
- Existing phone auth profiles unaffected
- Queries by telegram_chat_id are fast