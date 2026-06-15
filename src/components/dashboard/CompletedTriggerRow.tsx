import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, CheckCircle2, Clock, Check, X } from "lucide-react";
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

/** "inning" + 3 → "3rd Inning or later" (matches the active tab). */
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

/** Score line with the winner emphasized (black) and the loser de-emphasized (grey). */
function ScoreLine({
  awayTeam,
  awayScore,
  homeTeam,
  homeScore,
  detail,
}: {
  awayTeam: string;
  awayScore: number | string;
  homeTeam: string;
  homeScore: number | string;
  detail?: string | null;
}) {
  const a = Number(awayScore);
  const h = Number(homeScore);
  const awayWin = a > h;
  const homeWin = h > a;
  const win = "font-semibold text-gray-900";
  const lose = "text-gray-500";
  return (
    <span className="text-sm">
      <span className={awayWin ? win : lose}>
        {awayTeam} {awayScore}
      </span>
      <span className="text-gray-300"> – </span>
      <span className={homeWin ? win : lose}>
        {homeTeam} {homeScore}
      </span>
      {detail ? <span className="text-gray-500"> · {detail}</span> : null}
    </span>
  );
}

function HitMissBadge({ won }: { won: boolean | null }) {
  if (won === true) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
        <Check className="h-3 w-3" /> Hit
      </span>
    );
  }
  if (won === false) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
        <X className="h-3 w-3" /> Miss
      </span>
    );
  }
  return <span className="shrink-0 text-xs text-gray-400">Pending</span>;
}

/** Did the user's team win, based on the final score? null = can't determine. */
function didTeamWin(team: string, final: any): boolean | null {
  if (!final) return null;
  const hs = Number(final.homeScore);
  const as = Number(final.awayScore);
  if (Number.isNaN(hs) || Number.isNaN(as)) return null;
  const t = team.toLowerCase();
  const home = (final.homeTeam || "").toLowerCase();
  const away = (final.awayTeam || "").toLowerCase();
  const isHome = !!home && (home.includes(t) || t.includes(home));
  const isAway = !!away && (away.includes(t) || t.includes(away));
  if (isHome && !isAway) return hs > as;
  if (isAway && !isHome) return as > hs;
  return null;
}

export function CompletedTriggerRow({ profileTrigger, onDelete }: CompletedTriggerRowProps) {
  const trigger = profileTrigger.trigger;
  if (!trigger) return null;

  const latestMatch: any = trigger.trigger_matches
    ?.slice()
    .sort((a, b) => new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime())[0];

  const snapshot = latestMatch?.odds_snapshot;
  const espn = snapshot?.scores_data; // game state when the alert fired (SCENARIO)
  const finalScore = latestMatch?.final; // latest snapshot for the game (OUTCOME)

  const hasScenario =
    espn?.found && espn.homeScore !== undefined && espn.awayScore !== undefined;
  const hasFinal =
    finalScore && finalScore.homeScore !== undefined && finalScore.awayScore !== undefined;

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

      {/* Details (stacked) — full condition mirrors the Active tab, then the result */}
      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
        <DetailRow
          label="Condition"
          value={`${getBetTypeLabel(trigger.bet_type)} ${getComparatorLabel(trigger.odds_comparator)} ${formatOdds(Number(trigger.odds_value))}`}
        />
        <DetailRow label="Frequency" value={trigger.frequency === "once" ? "One time" : "Each game"} />
        <DetailRow label="Period" value={formatPeriod(trigger.time_period_type, trigger.time_period_min)} />

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

        {hasScenario && (
          <DetailRow
            label="Scenario"
            value={
              <ScoreLine
                awayTeam={espn!.awayTeam}
                awayScore={espn!.awayScore}
                homeTeam={espn!.homeTeam}
                homeScore={espn!.homeScore}
                detail={espn!.detail}
              />
            }
          />
        )}

        {hasFinal && (
          <div className="border-t border-gray-200 pt-2">
            <DetailRow
              label="Outcome"
              value={
                <div className="flex items-center justify-between gap-3">
                  <ScoreLine
                    awayTeam={finalScore.awayTeam}
                    awayScore={finalScore.awayScore}
                    homeTeam={finalScore.homeTeam}
                    homeScore={finalScore.homeScore}
                  />
                  <HitMissBadge won={didTeamWin(trigger.team_or_player, finalScore)} />
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
