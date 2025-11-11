import { supabase } from "@/integrations/supabase/client";
import type { Profile, Trigger, Alert, VendorLog, EvaluationRun } from "@/types/database";

export interface AdminStats {
  totalUsers: number;
  totalTriggers: number;
  activeTriggers: number;
  totalAlerts: number;
  alertsSentToday: number;
}

export interface AdminSettings {
  oddsPollingEnabled: boolean;
  pollingIntervalMinutes: number;
  maxApiCallsPerHour: number;
}

export const adminService = {
  async checkIsAdmin(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error) return false;
    return data?.role === "admin" || data?.role === "super_admin";
  },

  async getAdminStats(): Promise<AdminStats> {
    const [usersResult, triggersResult, alertsResult] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("triggers").select("id, status", { count: "exact" }),
      supabase.from("alerts").select("id, created_at", { count: "exact" })
    ]);

    const activeTriggers = triggersResult.data?.filter(t => t.status === "active").length || 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alertsSentToday = alertsResult.data?.filter(
      a => new Date(a.created_at) >= today
    ).length || 0;

    return {
      totalUsers: usersResult.count || 0,
      totalTriggers: triggersResult.count || 0,
      activeTriggers,
      totalAlerts: alertsResult.count || 0,
      alertsSentToday
    };
  },

  async getAllProfiles(limit = 50, offset = 0): Promise<Profile[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data as Profile[];
  },

  async getAllTriggers(limit = 100, offset = 0): Promise<Trigger[]> {
    const { data, error } = await supabase
      .from("triggers")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data as Trigger[];
  },

  async getVendorLogs(limit = 50): Promise<VendorLog[]> {
    const { data, error } = await supabase
      .from("vendor_logs")
      .select("*")
      .order("logged_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as VendorLog[];
  },

  async getEvaluationRuns(limit = 20): Promise<EvaluationRun[]> {
    const { data, error } = await supabase
      .from("evaluation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as EvaluationRun[];
  },

  async getAdminSettings(): Promise<AdminSettings> {
    const { data, error } = await supabase
      .from("admin_settings")
      .select("*")
      .in("setting_key", ["odds_polling_enabled", "polling_interval_minutes", "max_api_calls_per_hour"]);

    if (error) throw error;

    const settings: any = {};
    data?.forEach(setting => {
      settings[setting.setting_key] = setting.setting_value;
    });

    return {
      oddsPollingEnabled: settings.odds_polling_enabled === "true",
      pollingIntervalMinutes: parseInt(settings.polling_interval_minutes || "2"),
      maxApiCallsPerHour: parseInt(settings.max_api_calls_per_hour || "60")
    };
  },

  async updateAdminSetting(key: string, value: any): Promise<void> {
    const { error } = await supabase
      .from("admin_settings")
      .update({ 
        setting_value: value.toString(),
        updated_at: new Date().toISOString()
      })
      .eq("setting_key", key);

    if (error) throw error;
  },

  async updateUserRole(userId: string, role: string): Promise<void> {
    const { error } = await supabase
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) throw error;
  },

  async updateTriggerLimit(userId: string, limit: number): Promise<void> {
    const { error } = await supabase
      .from("profiles")
      .update({ trigger_limit: limit, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) throw error;
  },

  async manualPollAndCheckTriggers(): Promise<{ checked: number; hit: number; message: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error("No active session");
    }

    const response = await fetch("/api/admin/manual-poll", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      let errorMessage = "Failed to run manual poll";
      try {
        const error = await response.json();
        errorMessage = error.error || error.details || errorMessage;
      } catch (e) {
        const text = await response.text();
        errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      checked: data.checked || 0,
      hit: data.hit || 0,
      message: data.message || "Manual poll completed"
    };
  }
};
