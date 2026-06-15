import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";

type EventSchedule = Database["public"]["Tables"]["event_schedules"]["Row"];
type EventScheduleInsert = Database["public"]["Tables"]["event_schedules"]["Insert"];

const PREFERRED_BOOKMAKERS = ["draftkings", "fanduel"];

/**
 * Extract the home/away opening moneyline from an Odds API event, preferring
 * DraftKings/FanDuel, then any bookmaker that prices both teams.
 */
function extractOpeningMoneyline(
  event: any
): { home_ml: number | null; away_ml: number | null; bookmaker: string | null } {
  const bms = [...(event.bookmakers || [])].sort((a: any, b: any) => {
    const ai = PREFERRED_BOOKMAKERS.indexOf(a.key);
    const bi = PREFERRED_BOOKMAKERS.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const bm of bms) {
    const market = (bm.markets || []).find((m: any) => m.key === "h2h");
    if (!market) continue;
    const home = market.outcomes.find((o: any) => o.name === event.home_team);
    const away = market.outcomes.find((o: any) => o.name === event.away_team);
    if (home && away) {
      return { home_ml: Math.round(home.price), away_ml: Math.round(away.price), bookmaker: bm.title || bm.key };
    }
  }
  return { home_ml: null, away_ml: null, bookmaker: null };
}

/**
 * Fetch upcoming events from Odds API and sync to event_schedules.
 * Also captures the OPENING moneyline for not-yet-started games into
 * game_opening_odds (insert-once; never overwritten) so the "Comebacks" feature
 * has a true opening line to compare current scores against.
 */
export async function syncEventSchedules(
  supabase: SupabaseClient<Database>,
  oddsApiKey: string,
  leagueKeys: string[]
): Promise<{ synced: number; errors: string[] }> {
  let totalSynced = 0;
  const errors: string[] = [];

  for (const leagueKey of leagueKeys) {
    try {
      // Fetch events from Odds API
      const apiUrl = `https://api.the-odds-api.com/v4/sports/${leagueKey}/odds?apiKey=${oddsApiKey}&regions=us&markets=h2h`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        errors.push(`Failed to fetch events for ${leagueKey}: ${response.statusText}`);
        continue;
      }

      const events = await response.json();

      if (!Array.isArray(events) || events.length === 0) {
        console.log(`[ScheduleService] No events found for ${leagueKey}`);
        continue;
      }

      // Map API events to event_schedules format
      const scheduleInserts: EventScheduleInsert[] = events.map((event: any) => ({
        event_id: event.id,
        league_key: leagueKey,
        sport_key: event.sport_key,
        home_team: event.home_team,
        away_team: event.away_team,
        commence_time: event.commence_time,
        status: "scheduled",
        last_checked_at: new Date().toISOString(),
      }));

      // Upsert events (update if exists, insert if new)
      const { error: upsertError } = await supabase
        .from("event_schedules")
        .upsert(scheduleInserts, {
          onConflict: "event_id",
        });

      if (upsertError) {
        errors.push(`Failed to sync events for ${leagueKey}: ${upsertError.message}`);
        continue;
      }

      totalSynced += scheduleInserts.length;
      console.log(`[ScheduleService] Synced ${scheduleInserts.length} events for ${leagueKey}`);

      // Capture OPENING odds for games that have NOT started yet. Insert-once via
      // ON CONFLICT DO NOTHING (ignoreDuplicates) so the opening line is immutable.
      const now = Date.now();
      const openingRows = events
        .filter((e: any) => new Date(e.commence_time).getTime() > now)
        .map((e: any) => {
          const { home_ml, away_ml, bookmaker } = extractOpeningMoneyline(e);
          if (home_ml === null || away_ml === null) return null;
          return {
            event_id: e.id,
            sport: e.sport_key,
            home_team: e.home_team,
            away_team: e.away_team,
            commence_time: e.commence_time,
            home_ml,
            away_ml,
            bookmaker,
            captured_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (openingRows.length > 0) {
        const { error: openingError } = await (supabase as any)
          .from("game_opening_odds")
          .upsert(openingRows, { onConflict: "event_id", ignoreDuplicates: true });
        if (openingError) {
          console.error(`[ScheduleService] Opening-odds capture error for ${leagueKey}:`, openingError.message);
        } else {
          console.log(`[ScheduleService] Captured opening odds for up to ${openingRows.length} ${leagueKey} games`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Error syncing ${leagueKey}: ${message}`);
    }
  }

  return { synced: totalSynced, errors };
}

/**
 * Get sports with live events right now
 */
export async function getActiveSports(
  supabase: SupabaseClient<Database>
): Promise<string[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("event_schedules")
    .select("league_key")
    .eq("status", "live")
    .lte("commence_time", now);

  if (error) {
    console.error("[ScheduleService] Error fetching active sports:", error);
    return [];
  }

  // Get distinct league_keys
  const activeSports = [...new Set(data?.map(row => row.league_key) || [])];
  return activeSports;
}

/**
 * Mark events as live if their commence_time has passed
 */
export async function markEventsAsLive(
  supabase: SupabaseClient<Database>
): Promise<number> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("event_schedules")
    .update({
      status: "live",
      updated_at: now
    })
    .eq("status", "scheduled")
    .lte("commence_time", now)
    .select();

  if (error) {
    console.error("[ScheduleService] Error marking events as live:", error);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[ScheduleService] Marked ${count} events as live`);
  }
  return count;
}

/**
 * Mark events as completed if >3 hours past commence_time
 */
export async function markEventsAsCompleted(
  supabase: SupabaseClient<Database>
): Promise<number> {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("event_schedules")
    .update({
      status: "completed",
      updated_at: new Date().toISOString()
    })
    .eq("status", "live")
    .lte("commence_time", threeHoursAgo)
    .select();

  if (error) {
    console.error("[ScheduleService] Error marking events as completed:", error);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[ScheduleService] Marked ${count} events as completed`);
  }
  return count;
}
