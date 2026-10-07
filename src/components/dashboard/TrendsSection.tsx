import { useEffect, useMemo, useState } from "react";
import { LEAGUES, leagueLabel } from "@/lib/leagues";
import { formatGameTime } from "@/lib/gameUtils";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { shortTeam, type TrendInsight } from "@/lib/trendInsights";
import type { GameCardData } from "./GameCard";
import { TeamLogoImg } from "./TeamLogoImg";
import { LeaguePills } from "./LeaguePills";
import { TrendingUp } from "lucide-react";

interface TrendGame {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  live: boolean;
  liveDetail: string | null;
  homeScore: number | null;
  awayScore: number | null;
  totalLine: number | null;
  insights: TrendInsight[];
}

export interface TrendSelection {
  sportKey: string;
  team: string;
  card: GameCardData;
  betType?: "moneyline" | "totals";
  totalSide?: "over" | "under";
}

const VISIBLE = 3;

/**
 * Trends: today's games with their most lopsided team / total trends, ranked.
 * Tapping a trend opens the alert modal pre-set to the bet it points at.
 */
export function TrendsSection({ onSelect, refreshSignal }: { onSelect: (sel: TrendSelection) => void; refreshSignal?: number }) {
  const [league, setLeague] = useState("all");
  const [games, setGames] = useState<TrendGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const { logoFor } = useTeamLogos();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/trends/today")
      .then((r) => (r.ok ? r.json() : { games: [] }))
      .then((j) => active && setGames(j.games || []))
      .catch(() => active && setGames([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshSignal]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: games.length };
    LEAGUES.forEach((l) => (c[l.sportKey] = games.filter((g) => g.sportKey === l.sportKey).length));
    return c;
  }, [games]);

  const pills = [
    { key: "all", label: "All", count: counts.all },
    ...LEAGUES.map((l) => ({ key: l.sportKey, label: l.label, count: counts[l.sportKey] || 0 })),
  ];

  const filtered = league === "all" ? games : games.filter((g) => g.sportKey === league);
  const shown = showAll ? filtered : filtered.slice(0, VISIBLE);

  // Hide the whole section when there's nothing worth showing.
  if (!loading && games.length === 0) return null;

  const toCard = (g: TrendGame): GameCardData => ({
    sportKey: g.sportKey,
    awayTeam: g.awayTeam,
    homeTeam: g.homeTeam,
    awayLogo: logoFor(g.awayTeam),
    homeLogo: logoFor(g.homeTeam),
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    awayMl: null,
    homeMl: null,
    live: g.live,
    liveDetail: g.liveDetail,
    timeLabel: formatGameTime(g.commenceTime),
    commenceTime: g.commenceTime,
    situation: null,
  });

  const open = (g: TrendGame, i?: TrendInsight) =>
    onSelect({
      sportKey: g.sportKey,
      team: i?.kind === "moneyline" && i.team ? i.team : g.homeTeam,
      card: toCard(g),
      betType: i?.kind,
      totalSide: i?.side,
    });

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Trends</h2>
      <p className="text-sm text-muted-foreground mb-3">Today&apos;s strongest team and total trends. Tap one to set an alert.</p>
      <div className="mb-4">
        <LeaguePills pills={pills} value={league} onChange={setLeague} />
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading trends…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            {shown.map((g) => (
              <div key={g.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <button type="button" onClick={() => open(g)} className="w-full text-left" title="Set an alert on this game">
                  <div className="flex items-center justify-between mb-2 px-1">
                    {g.live ? (
                      <span className="text-[11px] font-bold text-red-500">
                        ● LIVE{g.liveDetail ? <span className="font-semibold text-orange-500"> · {g.liveDetail}</span> : null}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-gray-400">{formatGameTime(g.commenceTime)}</span>
                    )}
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      {leagueLabel(g.sportKey)}
                      {g.totalLine != null ? ` · O/U ${g.totalLine}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-1">
                    <TeamChip name={g.awayTeam} logo={logoFor(g.awayTeam)} score={g.live ? g.awayScore : null} />
                    <span className="text-xs text-gray-300">@</span>
                    <TeamChip name={g.homeTeam} logo={logoFor(g.homeTeam)} score={g.live ? g.homeScore : null} alignRight />
                  </div>
                </button>

                <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2">
                  {(() => {
                    const mlTeams = new Set(g.insights.filter((x) => x.kind === "moneyline" && x.team).map((x) => x.team));
                    const sides = new Set(g.insights.filter((x) => x.kind === "totals").map((x) => x.side));
                    return mlTeams.size > 1 || sides.size > 1 ? (
                      <p className="px-2 text-[11px] text-amber-600">Mixed signals — trends point both ways in this game.</p>
                    ) : null;
                  })()}
                  {g.insights.map((i, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => open(g, i)}
                      className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                      title={i.kind === "totals" ? `Set a ${i.side === "over" ? "Over" : "Under"} alert` : `Set a ${shortTeam(i.team || "")} moneyline alert`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-start gap-1.5">
                          <TrendTag i={i} totalLine={g.totalLine} logoFor={logoFor} homeTeam={g.homeTeam} awayTeam={g.awayTeam} />
                          <span className="text-xs leading-snug text-gray-700">{i.text}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <PriceMove start={i.startPrice ?? null} now={i.price ?? null} line={i.priceLine ?? null} side={i.side} live={g.live} />
                          <span className="w-9 text-right text-xs font-bold tabular-nums text-gray-900">{i.pct}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${i.pct >= 80 ? "bg-green-500" : "bg-green-400"}`}
                          style={{ width: `${i.pct}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filtered.length > VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <TrendingUp className="h-4 w-4" />
              {showAll ? "Show fewer" : `View more (${filtered.length - VISIBLE})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function TeamChip({ name, logo, score, alignRight }: { name: string; logo: string | null; score: number | null; alignRight?: boolean }) {
  const short = shortTeam(name);
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogoImg url={logo} alt={name} className="h-6 w-6 shrink-0 object-contain" />
      <span className="truncate text-sm font-semibold text-gray-900">{short}</span>
      {score != null && !Number.isNaN(score) ? <span className="text-sm font-bold tabular-nums text-gray-900">{score}</span> : null}
    </span>
  );
}

/**
 * Left-hand tag: who the bet is on + what it is. Always shows a small logo and
 * name — the team for ML and team-based totals trends, both logos + "Game" for
 * head-to-head totals.
 */
function TrendTag({
  i,
  totalLine,
  logoFor,
  homeTeam,
  awayTeam,
}: {
  i: TrendInsight;
  totalLine: number | null;
  logoFor: (n?: string | null) => string | null;
  homeTeam: string;
  awayTeam: string;
}) {
  // Totals are always the game total (not a team total), so they're tagged
  // "Game" with both logos; the trend text says which team's games it's from.
  const team = i.kind === "moneyline" ? i.team : undefined;
  const bet =
    i.kind === "moneyline" ? "ML" : `${i.side === "over" ? "Over" : "Under"}${totalLine != null ? ` ${totalLine}` : ""}`;
  const tone =
    i.kind === "moneyline"
      ? "bg-gray-100 text-gray-700"
      : i.side === "over"
      ? "bg-green-50 text-green-700"
      : "bg-blue-50 text-blue-700";
  return (
    <span className={`mt-px inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>
      {team ? (
        <TeamLogoImg url={logoFor(team)} alt={team} className="h-3.5 w-3.5 shrink-0 object-contain" />
      ) : (
        <span className="flex -space-x-1">
          <TeamLogoImg url={logoFor(awayTeam)} alt={awayTeam} className="h-3.5 w-3.5 shrink-0 object-contain" />
          <TeamLogoImg url={logoFor(homeTeam)} alt={homeTeam} className="h-3.5 w-3.5 shrink-0 object-contain" />
        </span>
      )}
      <span>{team ? shortTeam(team) : "Game"}</span>
      <span className="opacity-60">·</span>
      <span>{bet}</span>
    </span>
  );
}

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * "Started → now" price. Higher American odds = bigger payout, so a rising
 * number means the bet got cheaper (a growing deal) and shows green; falling
 * shows red. Pre-game "started" is the opening line; live it's the pre-game close.
 */
function PriceMove({
  start,
  now,
  line,
  side,
  live,
}: {
  start: number | null;
  now: number | null;
  line: number | null;
  side?: "over" | "under";
  live: boolean;
}) {
  if (start == null && now == null) return null;
  const moved = start != null && now != null && line == null && now !== start;
  const better = moved && now! > start!;
  const tone = !moved ? "text-gray-700" : better ? "text-green-600" : "text-red-600";
  return (
    <span
      className="flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] tabular-nums"
      title={live ? "Pre-game price → live price" : "Opening price → current price"}
    >
      {start != null ? <span className="text-gray-400">{fmt(start)}</span> : null}
      {start != null && now != null ? <span className="text-gray-300">→</span> : null}
      {now != null ? (
        <span className={`font-semibold ${tone}`}>
          {line != null ? `${side === "over" ? "o" : "u"}${line} ` : ""}
          {fmt(now)}
          {moved ? (better ? " ▲" : " ▼") : ""}
        </span>
      ) : (
        <span className="text-gray-400">{live ? "live off" : ""}</span>
      )}
    </span>
  );
}
