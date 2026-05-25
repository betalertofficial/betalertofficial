import { supabase } from "@/integrations/supabase/client";
import type { Alert } from "@/types/database";
import { sendTelegramMessage, formatTelegramAlert } from "./telegramService";

const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/7723146/u140xkd/";

export const alertService = {
  async getUserAlerts(userId: string, limit = 50): Promise<Alert[]> {
    const { data, error } = await supabase
      .from("alerts")
      .select(`
        id,
        trigger_match_id,
        profile_id,
        message,
        delivery_status,
        webhook_response,
        sent_at,
        created_at,
        trigger_match:trigger_matches (
          id,
          matched_value,
          matched_at,
          trigger:triggers (
            id,
            sport,
            team_or_player,
            bet_type,
            odds_comparator,
            odds_value
          ),
          odds_snapshot:odds_snapshots (
            id,
            bookmaker,
            deep_link_url,
            commence_time
          )
        )
      `)
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as Alert[];
  },

  async sendWebhookAlert(payload: {
    trigger_id: string;
    trigger_match_id: string;
    recipient_profile_id: string;
    message: string;
    fired_value: number;
    fired_context: any;
    sport: string;
    team: string;
    vendor: string;
    bookmakers: string[];
    deep_link_url?: string;
    timestamp: string;
  }): Promise<Response> {
    const response = await fetch(ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return response;
  },

  async createAlert(
    profileId: string,
    triggerMatchId: string,
    message: string
  ): Promise<Alert> {
    const { data, error } = await supabase
      .from("alerts")
      .insert([
        {
          profile_id: profileId,
          trigger_match_id: triggerMatchId,
          message,
          delivery_status: "pending"
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data as Alert;
  },

  async updateAlertStatus(
    alertId: string,
    status: "sent" | "failed",
    webhookResponse?: any
  ): Promise<void> {
    const { error } = await supabase
      .from("alerts")
      .update({
        delivery_status: status,
        webhook_response: webhookResponse,
        sent_at: new Date().toISOString()
      })
      .eq("id", alertId);

    if (error) throw error;
  },

  // Main alert routing function - Telegram first, Zapier fallback
  async sendAlert(
    supabaseClient: any,
    profileId: string,
    trigger: any,
    snapshot: any,
    triggerMatchId?: string
  ): Promise<boolean> {
    try {
      // Get user profile to check for telegram_chat_id
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("telegram_chat_id")
        .eq("id", profileId)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        return false;
      }

      const message = `Trigger Hit! ${trigger.team_or_player} ${trigger.bet_type} ${trigger.odds_comparator} ${trigger.odds_value}. Found: ${snapshot.odds_value} at ${snapshot.bookmaker}`;
      
      // Create alert record first
      const { data: alert, error: alertError } = await supabaseClient
        .from("alerts")
        .insert([
          {
            profile_id: profileId,
            trigger_match_id: triggerMatchId || null,
            message,
            delivery_status: "pending"
          }
        ])
        .select()
        .single();

      if (alertError) {
        console.error("Error creating alert record:", alertError);
        return false;
      }

      // Route to Telegram if telegram_chat_id exists
      if (profile.telegram_chat_id) {
        console.log(`Routing alert to Telegram for user ${profileId}`);
        
        // Extract ESPN game data from scores_data if available
        let espnData = undefined;
        if (snapshot.scores_data) {
          espnData = {
            home_score: snapshot.scores_data.home_score,
            away_score: snapshot.scores_data.away_score,
            period: snapshot.scores_data.period,
            detail: snapshot.scores_data.detail,
            status: snapshot.scores_data.status,
          };
        }
        
        const telegramMessage = formatTelegramAlert({
          game: trigger.team_or_player,
          market: trigger.bet_type,
          detail: snapshot.bookmaker,
          currentOdds: snapshot.odds_value,
          targetOdds: trigger.odds_value,
          espnData,
        });

        const result = await sendTelegramMessage({
          chatId: profile.telegram_chat_id,
          text: telegramMessage,
        });

        // Update alert status
        await supabaseClient
          .from("alerts")
          .update({
            delivery_status: result.success ? "sent" : "failed",
            webhook_response: result.error ? { error: result.error } : { success: true },
            sent_at: new Date().toISOString()
          })
          .eq("id", alert.id);

        return result.success;
      } else {
        // Fallback to Zapier webhook
        console.log(`No Telegram chat_id, routing to Zapier for user ${profileId}`);
        
        const payload = {
          trigger_id: trigger.id,
          trigger_match_id: triggerMatchId || "",
          recipient_profile_id: profileId,
          message,
          fired_value: snapshot.odds_value,
          fired_context: snapshot,
          sport: trigger.sport,
          team: trigger.team_or_player,
          vendor: snapshot.vendor || "unknown",
          bookmakers: [snapshot.bookmaker],
          deep_link_url: snapshot.deep_link_url,
          timestamp: new Date().toISOString()
        };

        const response = await this.sendWebhookAlert(payload);
        
        // Update alert status
        await supabaseClient
          .from("alerts")
          .update({
            delivery_status: response.ok ? "sent" : "failed",
            webhook_response: response.ok ? { success: true } : { error: "Webhook failed" },
            sent_at: new Date().toISOString()
          })
          .eq("id", alert.id);

        return response.ok;
      }
    } catch (err) {
      console.error("Exception in sendAlert:", err);
      return false;
    }
  }
};
