import { useEffect, useMemo, useState } from "react";
import { oddsApiService, type OddsApiEvent, type OddsApiScore } from "@/services/oddsApiService";
import { LEAGUES, leagueLabel } from "@/lib/leagues";
import { isGameLive, formatGameTime, formatOdds, getTeamMoneyline, scoreLookup } from "@/lib/gameUtils";
import { LeaguePills } from "./LeaguePills";

interface GameVM {
  event: OddsApiEvent;
  sportKey: string;
  live: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homeMl: number | null;
  awayMl: number | null;
}

export interface GameSelection {
  sportKey: string;
  team: string;
  event: OddsApiEvent;
}

function isWithinNextDay(commence: string) {
  const diff = new Date(commence).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

export function ActiveGames({ onSelectGame }: { onSelectGame: (sel: GameSelection) => void }) {
  const [league, setLeague] = useState("all");
  const [games, setGames] = useState<GameVM[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const all: GameVM[] = [];
      await Promise.all(
        LEAGUES.map(async (lg) => {
          try {
            const [events, scores] = await Promise.all([
              oddsApiService.getOddsForSport(lg.sportKey).catch(() => [] as OddsApiEvent[]),
              oddsApiService.getScores(lg.sportKey).catch(() => [] as OddsApiScore[]),
            ]);
            const scoreById: Record<string, OddsApiScore> = {};
            scores.forEach((s) => { scoreById[s.id] = s; });
            for (const ev of events) {
              const live = isGameLive(ev.commence_time);
              if (!live && !isWithinNextDay(ev.commence_time)) continue; // live + upcoming today only
              const sc = scoreLookup(scoreById[ev.id]);
              all.push({
                event: ev,
                sportKey: lg.sportKey,
                live,
                homeScore: sc[ev.home_team] ?? null,
                awayScore: sc[ev.away_team] ?? null,
                homeMl: getTeamMoneyline(ev, ev.home_team),
                awayMl: getTeamMoneyline(ev, ev.away_team),
              });
            }
          } catch {
            /* skip league */
          }
        })
      );
      // Favor live games first, then soonest upcoming.
      all.sort(
        (a, b) =>
          Number(b.live) - Number(a.live) ||
          new Date(a.event.commence_time).getTime() - new Date(b.event.commence_time).getTime()
      );
      if (active) {
        setGames(all);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: games.length };
    LEAGUES.forEach((l) => { c[l.sportKey] = games.filter((g) => g.sportKey === l.sportKey).length; });
    return c;
  }, [games]);

  const pills = [
    { key: "all", label: "All", count: counts.all },
    ...LEAGUES.map((l) => ({ key: l.sportKey, label: l.label, count: counts[l.sportKey] || 0 })),
  ];
  const filtered = league === "all" ? games : games.filter((g) => g.sportKey === league);

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-3">Active &amp; Upcoming Games</h2>
      <div className="mb-4">
        <LeaguePills pills={pills} value={league} onChange={setLeague} />
      </div>
      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading games…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-6">No active or upcoming games right now.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((g) => (
            <GameCard
              key={g.event.id}
              g={g}
              onSelectTeam={(team) => onSelectGame({ sportKey: g.sportKey, team, event: g.event })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GameCard({ g, onSelectTeam }: { g: GameVM; onSelectTeam: (team: string) => void }) {
  const ev = g.event;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-1 px-1">
        {g.live ? (
          <span className="text-[11px] font-bold text-red-500">● LIVE</span>
        ) : (
          <span className="text-[11px] font-medium text-gray-400">{formatGameTime(ev.commence_time)}</span>
        )}
        <span className="text-[10px] uppercase tracking-wide text-gray-400">{leagueLabel(g.sportKey)}</span>
      </div>
      <TeamRow name={ev.away_team} score={g.awayScore} ml={g.awayMl} live={g.live} onClick={() => onSelectTeam(ev.away_team)} />
      <div className="h-px bg-gray-100 mx-1" />
      <TeamRow name={ev.home_team} score={g.homeScore} ml={g.homeMl} live={g.live} onClick={() => onSelectTeam(ev.home_team)} />
    </div>
  );
}

function TeamRow({
  name,
  score,
  ml,
  live,
  onClick,
}: {
  name: string;
  score: number | null;
  ml: number | null;
  live: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Set an alert on ${name}`}
      className="group relative flex items-center justify-between gap-2 w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-green-50 focus:outline-none focus-visible:bg-green-50"
    >
      {/* Green accent bar that appears on hover */}
      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-green-500 opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="truncate pl-1 text-sm font-semibold text-gray-900 transition-colors group-hover:text-green-700">
        {name}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-gray-400">{formatOdds(ml)}</span>
        {live && score !== null ? (
          <span className="w-6 text-right text-base font-bold tabular-nums text-gray-900">{score}</span>
        ) : null}
      </div>
    </button>
  );
}
