import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Pause, Play, Clock } from "lucide-react";
import { leagueLabel } from "@/lib/leagues";
import type { ReactNode } from "react";
import type { ProfileTrigger } from "@/types/database";

interface ActiveTriggerRowProps {
  profileTrigger: ProfileTrigger;
  lastPollAt: string | null;
  onPause: (triggerId: string) => void;
  onResume: (triggerId: string) => void;
  onDelete: (triggerId: string) => void;
}

function formatOdds(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function getComparatorLabel(comp: string): string {
  const labels: Record<string, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "==": "=" };
  return labels[comp] || comp;
}

function getBetTypeLabel(betType: string): string {
  const labels: Record<string, string> = {
    moneyline: "Moneyline", h2h: "Moneyline",
    spread: "Spread", spreads: "Spread",
    total: "Total", totals: "Total",
  };
  return labels[betType.toLowerCase()] ?? betType;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** "inning" + 3 → "3rd Inning or later" (works across sports: quarter/period/half). */
function formatPeriod(type: string | null | undefined, min: number | null | undefined): string {
  if (!type || !min) return "Any time";
  const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return `${ordinal(Number(min))} ${label} or later`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

export function ActiveTriggerRow({
  profileTrigger,
  lastPollAt,
  onPause,
  onResume,
  onDelete,
}: ActiveTriggerRowProps) {
  const trigger = profileTrigger.trigger;
  if (!trigger) return null;

  const isActive = trigger.status === "active";
  const isPaused = trigger.status === "paused";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${isActive ? "bg-green-500" : "bg-yellow-500"}`} />
            <h3 className="font-bold text-sm leading-tight truncate">{trigger.team_or_player}</h3>
            <Badge
              className={`shrink-0 px-1.5 py-0 text-[10px] ${
                isActive
                  ? "bg-green-500/10 text-green-700 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
              }`}
            >
              {trigger.status}
            </Badge>
          </div>
          <p className="mt-0.5 ml-3.5 flex items-center gap-1 text-xs text-muted-foreground">
            <span>{leagueLabel(trigger.sport)}</span>
            {lastPollAt && (
              <>
                <span>·</span>
                <Clock className="h-3 w-3" />
                <span>{timeAgo(lastPollAt)}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            title={isPaused ? "Resume" : "Pause"}
            onClick={() => (isPaused ? onResume(trigger.id) : onPause(trigger.id))}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
            title="Delete"
            onClick={() => onDelete(trigger.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Details (stacked, fits narrow column) */}
      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
        <DetailRow
          label="Condition"
          value={`${getBetTypeLabel(trigger.bet_type)} ${getComparatorLabel(trigger.odds_comparator)} ${formatOdds(Number(trigger.odds_value))}`}
        />
        <DetailRow label="When" value={trigger.frequency === "once" ? "One time" : "Each game"} />
        <DetailRow label="Period" value={formatPeriod(trigger.time_period_type, trigger.time_period_min)} />
      </div>
    </div>
  );
}
