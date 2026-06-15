-- Per-user sportsbook preference used by the trigger matching engine.
-- 'draftkings' | 'fanduel' = only evaluate that book's odds;
-- 'best' = use whichever of DraftKings/FanDuel gives the better payout.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_sportsbook TEXT NOT NULL DEFAULT 'best'
  CHECK (preferred_sportsbook IN ('draftkings', 'fanduel', 'best'));
