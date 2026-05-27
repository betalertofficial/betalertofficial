import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Pause, Play, Clock } from "lucide-react";
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
  const labels: Record<string, string> = {
    ">=": "≥", "<=": "≤", ">": ">", "<": "<", "==": "=",
  };
  return labels[comp] || comp;
}

function getBetTypeLabel(betType: string): string {
  const labels: Record<string, string> = {
    moneyline: "Moneyline", h2h: "Moneyline",
    spread: "Spread",      spreads: "Spread",
    total: "Total",        totals: "Total",
  };
  return labels[betType.toLowerCase()] ?? betType;
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
    <div className="trigger-card animate-slide-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            {/* Status dot */}
            <div
              className={`h-2 w-2 rounded-full shrink-0 ${
                isActive ? "bg-green-500" : "bg-yellow-500"
              }`}
            />
            <h3 className="font-bold text-lg leading-tight">{trigger.team_or_player}</h3>
            <Badge
              className={
                isActive
                  ? "bg-primary/10 text-primary border-primary/20 shrink-0"
                  : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 shrink-0"
              }
            >
              {trigger.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 ml-4">{trigger.sport}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4">
          {/* Last checked */}
          {lastPollAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Checked {timeAgo(lastPollAt)}
            </span>
          )}

          {/* Pause / Resume */}
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title={isPaused ? "Resume" : "Pause"}
            onClick={() => (isPaused ? onResume(trigger.id) : onPause(trigger.id))}
          >
            {isPaused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Delete */}
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            title="Delete"
            onClick={() => onDelete(trigger.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Three-column detail strip ── */}
      <div className="grid grid-cols-3 gap-6 pt-3 border-t border-border/40">
        {/* 1 · Condition */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Your Condition
          </p>
          <p className="font-semibold">
            {getBetTypeLabel(trigger.bet_type)}&nbsp;
            {getComparatorLabel(trigger.odds_comparator)}&nbsp;
            {formatOdds(Number(trigger.odds_value))}
          </p>
        </div>

        {/* 2 · Frequency */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Frequency
          </p>
          <p className="font-semibold">
            {trigger.frequency === "once" ? "One Time" : "Once Per Game"}
          </p>
        </div>

        {/* 3 · Period */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Period
          </p>
          <p className="font-semibold text-sm">
            {trigger.time_period_type && trigger.time_period_min
              ? `${trigger.time_period_type} ${trigger.time_period_min}+`
              : "Any Time"}
          </p>
        </div>
      </div>
    </div>
  );
}
