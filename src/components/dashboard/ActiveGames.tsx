import { useEffect, useMemo, useState } from "react";
import { oddsApiService, type OddsApiEvent, type OddsApiScore } from "@/services/oddsApiService";
import { LEAGUES, leagueLabel } from "@/lib/leagues";
import { isGameLive, isGameToday, formatGameTime, formatOdds, getTeamMoneyline, scoreLookup } from "@/lib/gameUtils";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { useEspnLive, type EspnSituation } from "@/hooks/useEspnLive";
import { TeamLogoImg } from "./TeamLogoImg";
import { LeaguePills } from "./LeaguePills";
import { ChevronDown, ChevronUp } from "lucide-react";

type Bucket = "live" | "today" | "tomorrow";

interface GameVM {
  event: OddsApiEvent;
  sportKey: string;
  bucket: Bucket;
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

function isTomorrow(commence: string) {
  const d = new Date(commence);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function bucketFor(commence: string): Bucket | null {
  if (isGameLive(commence)) return "live";
  const future = new Date(commence).getTime() > Date.now();
  if (future && isGameToday(commence)) return "today";
  if (isTomorrow(commence)) return "tomorrow";
  return null;
}

export function ActiveGames({ onSelectGame }: { onSelectGame: (sel: GameSelection) => void }) {
  const [league, setLeague] = useState("all");
  const [games, setGames] = useState<GameVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const { logoFor } = useTeamLogos();

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
              const bucket = bucketFor(ev.commence_time);
              if (!bucket) continue;
              const sc = scoreLookup(scoreById[ev.id]);
              all.push({
                event: ev,
                sportKey: lg.sportKey,
                bucket,
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
      if (active) {
        setGames(all);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Live ESPN detail (inning/period + MLB situation) only for leagues with live games.
  const liveSportKeys = useMemo(
    () => Array.from(new Set(games.filter((g) => g.bucket === "live").map((g) => g.sportKey))),
    [games]
  );
  const { getLive } = useEspnLive(liveSportKeys);

  const byCommence = (a: GameVM, b: GameVM) =>
    new Date(a.event.commence_time).getTime() - new Date(b.event.commence_time).getTime();

  const inLeague = (g: GameVM) => league === "all" || g.sportKey === league;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: games.length };
    LEAGUES.forEach((l) => { c[l.sportKey] = games.filter((g) => g.sportKey === l.sportKey).length; });
    return c;
  }, [games]);

  const pills = [
    { key: "all", label: "All", count: counts.all },
    ...LEAGUES.map((l) => ({ key: l.sportKey, label: l.label, count: counts[l.sportKey] || 0 })),
  ];

  const liveAndToday = games
    .filter((g) => inLeague(g) && (g.bucket === "live" || g.bucket === "today"))
    .sort((a, b) => (a.bucket === "live" ? 0 : 1) - (b.bucket === "live" ? 0 : 1) || byCommence(a, b));
  const tomorrow = games.filter((g) => inLeague(g) && g.bucket === "tomorrow").sort(byCommence);

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-3">Active &amp; Upcoming Games</h2>
      <div className="mb-4">
        <LeaguePills pills={pills} value={league} onChange={setLeague} />
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading games…</div>
      ) : liveAndToday.length === 0 && tomorrow.length === 0 ? (
        <div className="text-sm text-gray-400 py-6">No active or upcoming games right now.</div>
      ) : (
        <>
          {liveAndToday.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveAndToday.map((g) => (
                <GameCard
                  key={g.event.id}
                  g={g}
                  logoFor={logoFor}
                  getLive={getLive}
                  onSelectTeam={(team) => onSelectGame({ sportKey: g.sportKey, team, event: g.event })}
                />
              ))}
            </div>
          )}

          {tomorrow.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowTomorrow((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {showTomorrow ? "Hide" : "Show"} games for tomorrow ({tomorrow.length})
                {showTomorrow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showTomorrow && (
                <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tomorrow.map((g) => (
                    <GameCard
                      key={g.event.id}
                      g={g}
                      logoFor={logoFor}
                      getLive={getLive}
                      onSelectTeam={(team) => onSelectGame({ sportKey: g.sportKey, team, event: g.event })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function GameCard({
  g,
  logoFor,
  getLive,
  onSelectTeam,
}: {
  g: GameVM;
  logoFor: (name?: string | null) => string | null;
  getLive: (away: string, home: string) => { detail: string; situation: EspnSituation | null } | null;
  onSelectTeam: (team: string) => void;
}) {
  const ev = g.event;
  const live = g.bucket === "live";
  const espn = live ? getLive(ev.away_team, ev.home_team) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-1 px-1">
        {live ? (
          <span className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="text-red-500">● LIVE</span>
            {espn?.detail ? <span className="font-semibold text-orange-500">· {espn.detail}</span> : null}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-gray-400">
            {g.bucket === "tomorrow" ? "Tomorrow · " : ""}
            {formatGameTime(ev.commence_time)}
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wide text-gray-400">{leagueLabel(g.sportKey)}</span>
      </div>

      <TeamRow name={ev.away_team} logo={logoFor(ev.away_team)} score={g.awayScore} ml={g.awayMl} live={live} onClick={() => onSelectTeam(ev.away_team)} />
      <div className="h-px bg-gray-100 mx-1" />
      <TeamRow name={ev.home_team} logo={logoFor(ev.home_team)} score={g.homeScore} ml={g.homeMl} live={live} onClick={() => onSelectTeam(ev.home_team)} />

      {live && espn?.situation ? <SituationStrip situation={espn.situation} /> : null}
    </div>
  );
}

function TeamRow({
  name,
  logo,
  score,
  ml,
  live,
  onClick,
}: {
  name: string;
  logo: string | null;
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
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
    >
      <span className="flex min-w-0 items-center gap-2">
        <TeamLogoImg url={logo} alt={name} className="h-5 w-5 shrink-0 object-contain" />
        <span className="truncate text-sm font-semibold text-gray-900">{name}</span>
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

function Bases({ situation }: { situation: EspnSituation }) {
  const base = (on?: boolean) =>
    `absolute h-2.5 w-2.5 rounded-sm ${on ? "bg-yellow-400" : "border border-gray-300"}`;
  return (
    <div className="relative shrink-0" style={{ width: 30, height: 24 }}>
      {/* 2nd base (top) */}
      <div className={base(situation.onSecond)} style={{ top: 0, left: "50%", transform: "translateX(-50%) rotate(45deg)" }} />
      {/* 3rd base (left) */}
      <div className={base(situation.onThird)} style={{ top: "50%", left: 0, transform: "translateY(-50%) rotate(45deg)" }} />
      {/* 1st base (right) */}
      <div className={base(situation.onFirst)} style={{ top: "50%", right: 0, transform: "translateY(-50%) rotate(45deg)" }} />
    </div>
  );
}

function SituationStrip({ situation }: { situation: EspnSituation }) {
  const rows = [
    { label: "B", max: 4, count: situation.balls ?? 0, color: "bg-green-500" },
    { label: "S", max: 3, count: situation.strikes ?? 0, color: "bg-yellow-500" },
    { label: "O", max: 3, count: situation.outs ?? 0, color: "bg-red-500" },
  ];
  return (
    <div className="mt-2 flex items-center justify-center gap-4 border-t border-gray-100 pt-2">
      <Bases situation={situation} />
      <div className="flex items-center gap-2.5">
        {rows.map(({ label, max, count, color }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-gray-400">{label}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: max }).map((_, i) => (
                <div key={i} className={`h-1.5 w-1.5 rounded-full ${i < count ? color : "bg-gray-200"}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
