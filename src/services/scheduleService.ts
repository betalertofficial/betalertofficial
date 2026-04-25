import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";

type EventSchedule = Database["public"]["Tables"]["event_schedules"]["Row"];
type EventScheduleInsert = Database["public"]["Tables"]["event_schedules"]["Insert"];

/**
 * Fetch upcoming events from Odds API and sync to event_schedules
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