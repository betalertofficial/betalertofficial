import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, CheckCircle2, Clock } from "lucide-react";
import type { ProfileTrigger } from "@/types/database";

interface CompletedTriggerRowProps {
  profileTrigger: ProfileTrigger;
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CompletedTriggerRow({ profileTrigger, onDelete }: CompletedTriggerRowProps) {
  const trigger = profileTrigger.trigger;
  if (!trigger) return null;

  // Pick the most-recent match (matches arrive unordered from DB)
  const latestMatch = trigger.trigger_matches
    ?.slice()
    .sort((a, b) => new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime())[0];

  const snapshot = latestMatch?.odds_snapshot;
  const espn = snapshot?.scores_data;

  // Determine score display — ESPN stores camelCase (homeScore / homeTeam)
  const hasScore =
    espn?.found &&
    espn.homeScore !== undefined &&
    espn.awayScore !== undefined;

  return (
    <div className="trigger-card animate-slide-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <h3 className="font-bold text-lg leading-tight">{trigger.team_or_player}</h3>
            <Badge className="bg-muted text-muted-foreground shrink-0">completed</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 ml-6">{trigger.sport}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-4">
          {latestMatch && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(latestMatch.matched_at)}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(trigger.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Three-column detail strip ── */}
      <div className="grid grid-cols-3 gap-6 pt-3 border-t border-border/40">

        {/* 1 · Your Condition */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Your Condition
          </p>
          <p className="font-semibold">
            {getBetTypeLabel(trigger.bet_type)}&nbsp;
            {getComparatorLabel(trigger.odds_comparator)}&nbsp;
            {formatOdds(Number(trigger.odds_value))}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {trigger.time_period_type && trigger.time_period_min
              ? `${trigger.time_period_type} ${trigger.time_period_min}+`
              : "Any Time"}
          </p>
        </div>

        {/* 2 · Match Found */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Match Found
          </p>
          {latestMatch ? (
            <>
              <p className="font-semibold">{snapshot?.bookmaker ?? "—"}</p>
              <p className="text-sm mt-1">
                <span className="text-green-500 font-mono font-semibold">
                  {formatOdds(latestMatch.matched_value)}
                </span>
                <span className="text-muted-foreground text-xs ml-1.5">
                  target {formatOdds(Number(trigger.odds_value))}
                </span>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">—</p>
          )}
        </div>

        {/* 3 · Game State */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Game State
          </p>
          {hasScore ? (
            <>
              <p className="font-semibold text-sm">
                {espn!.awayTeam} {espn!.awayScore} – {espn!.homeTeam} {espn!.homeScore}
              </p>
              {espn!.detail && (
                <p className="text-xs text-muted-foreground mt-1">{espn!.detail}</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
