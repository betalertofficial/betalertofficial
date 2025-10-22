/* eslint-disable @typescript-eslint/no-empty-object-type */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string | null
          delivery_status: string | null
          id: string
          message: string
          profile_id: string | null
          sent_at: string | null
          trigger_match_id: string | null
          webhook_response: Json | null
        }
        Insert: {
          created_at?: string | null
          delivery_status?: string | null
          id?: string
          message: string
          profile_id?: string | null
          sent_at?: string | null
          trigger_match_id?: string | null
          webhook_response?: Json | null
        }
        Update: {
          created_at?: string | null
          delivery_status?: string | null
          id?: string
          message?: string
          profile_id?: string | null
          sent_at?: string | null
          trigger_match_id?: string | null
          webhook_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_trigger_match_id_fkey"
            columns: ["trigger_match_id"]
            isOneToOne: false
            referencedRelation: "trigger_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_runs: {
        Row: {
          alerts_sent: number | null
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          matches_found: number | null
          started_at: string | null
          status: string | null
          triggers_evaluated: number | null
        }
        Insert: {
          alerts_sent?: number | null
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          matches_found?: number | null
          started_at?: string | null
          status?: string | null
          triggers_evaluated?: number | null
        }
        Update: {
          alerts_sent?: number | null
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          matches_found?: number | null
          started_at?: string | null
          status?: string | null
          triggers_evaluated?: number | null
        }
        Relationships: []
      }
      odds_feed_events: {
        Row: {
          event_count: number | null
          fetched_at: string | null
          id: string
          raw_payload: Json
          vendor_id: string | null
        }
        Insert: {
          event_count?: number | null
          fetched_at?: string | null
          id?: string
          raw_payload: Json
          vendor_id?: string | null
        }
        Update: {
          event_count?: number | null
          fetched_at?: string | null
          id?: string
          raw_payload?: Json
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odds_feed_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_snapshots: {
        Row: {
          bet_type: string
          bookmaker: string
          commence_time: string | null
          deep_link_url: string | null
          event_id: string
          feed_event_id: string | null
          id: string
          odds_value: number
          snapshot_at: string | null
          sport: string
          team_or_player: string
        }
        Insert: {
          bet_type: string
          bookmaker: string
          commence_time?: string | null
          deep_link_url?: string | null
          event_id: string
          feed_event_id?: string | null
          id?: string
          odds_value: number
          snapshot_at?: string | null
          sport: string
          team_or_player: string
        }
        Update: {
          bet_type?: string
          bookmaker?: string
          commence_time?: string | null
          deep_link_url?: string | null
          event_id?: string
          feed_event_id?: string | null
          id?: string
          odds_value?: number
          snapshot_at?: string | null
          sport?: string
          team_or_player?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_snapshots_feed_event_id_fkey"
            columns: ["feed_event_id"]
            isOneToOne: false
            referencedRelation: "odds_feed_events"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_triggers: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          trigger_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          trigger_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          trigger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_triggers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_triggers_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country_code: string
          created_at: string | null
          id: string
          name: string | null
          phone_e164: string
          subscription_tier: string | null
          trigger_limit: number | null
          updated_at: string | null
        }
        Insert: {
          country_code: string
          created_at?: string | null
          id: string
          name?: string | null
          phone_e164: string
          subscription_tier?: string | null
          trigger_limit?: number | null
          updated_at?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string | null
          id?: string
          name?: string | null
          phone_e164?: string
          subscription_tier?: string | null
          trigger_limit?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trigger_matches: {
        Row: {
          id: string
          matched_at: string | null
          matched_value: number
          odds_snapshot_id: string | null
          trigger_id: string | null
        }
        Insert: {
          id?: string
          matched_at?: string | null
          matched_value: number
          odds_snapshot_id?: string | null
          trigger_id?: string | null
        }
        Update: {
          id?: string
          matched_at?: string | null
          matched_value?: number
          odds_snapshot_id?: string | null
          trigger_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trigger_matches_odds_snapshot_id_fkey"
            columns: ["odds_snapshot_id"]
            isOneToOne: false
            referencedRelation: "odds_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trigger_matches_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      triggers: {
        Row: {
          bet_type: string
          created_at: string | null
          frequency: string
          id: string
          odds_comparator: string
          odds_value: number
          sport: string
          status: string | null
          team_or_player: string
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          bet_type: string
          created_at?: string | null
          frequency: string
          id?: string
          odds_comparator: string
          odds_value: number
          sport: string
          status?: string | null
          team_or_player: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          bet_type?: string
          created_at?: string | null
          frequency?: string
          id?: string
          odds_comparator?: string
          odds_value?: number
          sport?: string
          status?: string | null
          team_or_player?: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: []
      }
      vendor_logs: {
        Row: {
          error_message: string | null
          id: string
          logged_at: string | null
          request_method: string
          request_url: string
          response_status: number | null
          response_time_ms: number | null
          vendor_id: string | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          logged_at?: string | null
          request_method: string
          request_url: string
          response_status?: number | null
          response_time_ms?: number | null
          vendor_id?: string | null
        }
        Update: {
          error_message?: string | null
          id?: string
          logged_at?: string | null
          request_method?: string
          request_url?: string
          response_status?: number | null
          response_time_ms?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_logs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          rate_limit_per_minute: number | null
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          rate_limit_per_minute?: number | null
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          rate_limit_per_minute?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
