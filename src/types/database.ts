export type BetType = "moneyline" | "spread";
export type OddsComparator = ">=" | "<=" | ">" | "<" | "==";
export type TriggerFrequency = "once" | "recurring";
export type TriggerStatus = "active" | "paused" | "completed" | "deleted";
export type DeliveryStatus = "pending" | "sent" | "failed";
export type Bookmaker = "FanDuel" | "DraftKings";

export interface Profile {
  id: string;
  phone_number?: string | null;
  phone_e164?: string | null;
  country_code?: string | null;
  name?: string | null;
  role?: string | null;
  subscription_tier?: string | null;
  trigger_limit?: number | null;
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  api_key?: string;
  base_url?: string;
  is_active: boolean;
  rate_limit_per_minute?: number;
  created_at: string;
}

export interface Trigger {
  id: string;
  sport: string;
  team_or_player: string;
  bet_type: BetType;
  odds_comparator: OddsComparator;
  odds_value: number;
  frequency: TriggerFrequency;
  status: TriggerStatus;
  vendor_id: string;
  bookmaker?: string | null;
  time_period_type?: string | null;
  time_period_min?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileTrigger {
  id: string;
  profile_id: string;
  trigger_id: string;
  created_at: string;
  trigger?: Trigger & {
    /** Most-recent matches, populated for completed triggers. Sorted newest-first client-side. */
    trigger_matches?: TriggerMatch[];
  };
}

export interface OddsFeedEvent {
  id: string;
  vendor_id?: string;
  raw_payload: any;
  event_count?: number;
  fetched_at: string;
}

export interface OddsSnapshot {
  id: string;
  feed_event_id?: string;
  sport: string;
  event_id: string;
  team_or_player: string;
  bookmaker: Bookmaker;
  bet_type: string;
  odds_value: number;
  deep_link_url?: string;
  commence_time?: string;
  snapshot_at: string;
  /** ESPN live game data stored at snapshot time (camelCase from espnService) */
  scores_data?: {
    found: boolean;
    homeTeam?: string;
    awayTeam?: string;
    homeScore?: number;
    awayScore?: number;
    period?: number;
    clock?: string;
    state?: string;
    detail?: string;
    espnGameId?: string;
  } | null;
  event_data?: any;
}

export interface TriggerMatch {
  id: string;
  trigger_id?: string;
  odds_snapshot_id?: string;
  matched_value: number;
  matched_at: string;
  trigger?: Trigger;
  odds_snapshot?: OddsSnapshot;
}

export interface Alert {
  id: string;
  trigger_match_id?: string;
  profile_id?: string;
  message: string;
  delivery_status: DeliveryStatus;
  webhook_response?: any;
  sent_at?: string;
  created_at: string;
  trigger_match?: TriggerMatch;
}

export interface VendorLog {
  id: string;
  vendor_id?: string;
  request_url: string;
  request_method: string;
  response_status?: number;
  response_time_ms?: number;
  error_message?: string;
  logged_at: string;
}

export interface EvaluationRun {
  id: string;
  triggers_evaluated: number;
  matches_found: number;
  alerts_sent: number;
  duration_ms?: number;
  status: "running" | "completed" | "failed";
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface AdminSettings {
  id: string;
  setting_key: string;
  setting_value: any;
  updated_at: string;
}
