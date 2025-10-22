
import { supabase } from "@/integrations/supabase/client";
import type { Alert } from "@/types/database";

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
    return data;
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
  }
};
