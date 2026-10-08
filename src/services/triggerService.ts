import type { Trigger, ProfileTrigger, BetType, TriggerFrequency } from "@/types/database";

interface CreateTriggerParams {
  sport: string;
  team_or_player: string;
  team_id?: string;
  bet_type: BetType;
  odds_comparator: string;
  odds_value: number;
  bookmaker?: string;
  vendor_id?: string;
  frequency: TriggerFrequency;
  status: string;
  time_period_type?: string | null;
  time_period_min?: number | null;
  // Event binding for "just this game" (once) triggers. When set, the cron
  // matches ONLY this Odds API event; event_commence drives auto-expiry once
  // the game is over.
  event_id?: string | null;
  event_commence?: string | null;
  // Totals triggers: the user's line (team_or_player is "Over"/"Under") and a
  // display label for the bound game, e.g. "LAD @ ATL".
  line_value?: number | null;
  game_label?: string | null;
}

export const triggerService = {
  // All trigger reads/writes go through server routes scoped to the signed-in
  // user (telegram_session cookie). The tables no longer accept the browser's
  // public key. `userId` args are kept for call-site compatibility.
  async getUserTriggers(_userId: string): Promise<ProfileTrigger[]> {
    const r = await fetch("/api/triggers", { credentials: "include" });
    if (!r.ok) throw new Error(`Failed to load triggers (HTTP ${r.status})`);
    const j = await r.json();
    return (j.data ?? []) as ProfileTrigger[];
  },

  async createTrigger(userId: string, params: CreateTriggerParams): Promise<ProfileTrigger> {
    if (!userId) {
      throw new Error("User ID is required");
    }
    const r = await fetch("/api/triggers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(params),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `Failed to create trigger (HTTP ${r.status})`);
    return j.data as ProfileTrigger;
  },

  async updateTrigger(triggerId: string, updates: Partial<Trigger>): Promise<Trigger> {
    const r = await fetch(`/api/triggers/${encodeURIComponent(triggerId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: updates.status }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `Failed to update trigger (HTTP ${r.status})`);
    return j.data as Trigger;
  },

  async deleteTrigger(_userId: string, triggerId: string): Promise<void> {
    const r = await fetch(`/api/triggers/${encodeURIComponent(triggerId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j?.error || `Failed to delete trigger (HTTP ${r.status})`);
    }
  },
};
