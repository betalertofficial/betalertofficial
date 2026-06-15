import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, CheckCircle2, Clock } from "lucide-react";
import { leagueLabel } from "@/lib/leagues";
import type { ReactNode } from "react";
import type { ProfileTrigger } from "@/types/database";

interface CompletedTriggerRowProps {
  profileTrigger: ProfileTrigger;
  onDelete: (triggerId: string) => void;
}

function formatOdds(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function getComparatorLabel(comp: string): string {
  const labels: Record<string, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "==": "=" };
  return labels[comp] || comp;
}

function getDirectionLabel(comp: string): string {
  if (comp === ">=" || comp === ">") return "or higher";
  if (comp === "<=" || comp === "<") return "or lower";
  return "";
}

function getBetTypeLabel(betType: string): string {
  const labels: Record<string, string> = {
    moneyline: "Moneyline", h2h: "Moneyline",
    spread: "Spread", spreads: "Spread",
    total: "Total", totals: "Total",
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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

export function CompletedTriggerRow({ profileTrigger, onDelete }: CompletedTriggerRowProps) {
  const trigger = profileTrigger.trigger;
  if (!trigger) return null;

  const latestMatch = trigger.trigger_matches
    ?.slice()
    .sort((a, b) => new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime())[0];

  const snapshot = latestMatch?.odds_snapshot;
  const espn = snapshot?.scores_data;
  const hasScore = espn?.found && espn.homeScore !== undefined && espn.awayScore !== undefined;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            <h3 className="font-bold text-sm leading-tight truncate">{trigger.team_or_player}</h3>
            <Badge className="shrink-0 border-transparent bg-gray-100 px-1.5 py-0 text-[10px] text-gray-500">done</Badge>
          </div>
          <p className="mt-0.5 ml-5 flex items-center gap-1 text-xs text-muted-foreground">
            <span>{leagueLabel(trigger.sport)}</span>
            {latestMatch && (
              <>
                <span>·</span>
                <Clock className="h-3 w-3" />
                <span>{timeAgo(latestMatch.matched_at)}</span>
              </>
            )}
          </p>
        </div>

        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
          title="Delete"
          onClick={() => onDelete(trigger.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Details (stacked) */}
      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
        <DetailRow
          label="Condition"
          value={`${getBetTypeLabel(trigger.bet_type)} ${getComparatorLabel(trigger.odds_comparator)} ${formatOdds(Number(trigger.odds_value))} ${getDirectionLabel(trigger.odds_comparator)}`}
        />

        {latestMatch && (
          <DetailRow
            label="Matched"
            value={
              <span>
                {snapshot?.bookmaker ? <span className="text-gray-500">{snapshot.bookmaker} </span> : null}
                <span className="font-semibold text-green-600">{formatOdds(latestMatch.matched_value)}</span>
              </span>
            }
          />
        )}

        {hasScore && (
          <DetailRow
            label="Final"
            value={
              <span>
                {espn!.awayTeam} {espn!.awayScore} – {espn!.homeTeam} {espn!.homeScore}
                {espn!.detail ? <span className="text-gray-400"> · {espn!.detail}</span> : null}
              </span>
            }
          />
        )}
      </div>
    </div>
  );
}
