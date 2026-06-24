import { useEffect, useMemo, useState } from "react";
import type { OddsApiEvent } from "@/services/oddsApiService";
import { LEAGUES, leagueLabel } from "@/lib/leagues";
import { isGameToday, formatGameTime } from "@/lib/gameUtils";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import type { EspnSituation } from "@/hooks/useEspnLive";
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
  // Live status detail straight from ESPN, e.g. "Top 7th", "Q3 5:21", "63'".
  liveDetail: string | null;
  // MLB only: balls/strikes/outs + bases, from ESPN competition.situation.
  situation: EspnSituation | null;
}

export interface GameSelection {
  sportKey: string;
  team: string;
  event: OddsApiEvent;
}

// Odds API sport key (used everywhere else in the app + by the cron) -> ESPN
// scoreboard path. The dashboard sources the game grid from ESPN (free) instead
// of the paid Odds API; the Odds API sportKey is still what we hand to
// CreateTrigger so trigger creation + cron matching are unaffected.
const SCOREBOARD_PATH: Record<string, string> = {
  baseball_mlb: "baseball/mlb",
  basketball_nba: "basketball/nba",
  americanfootball_nfl: "football/nfl",
  icehockey_nhl: "hockey/nhl",
  soccer_fifa_world_cup: "soccer/fifa.world",
};

function isTomorrow(commence: string) {
  const d = new Date(commence);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function toInt(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Pull live/upcoming games for a league from the ESPN scoreboard (free, no key,
 * CORS-friendly from the browser). We fetch today's and tomorrow's slates and
 * bucket each event by its real start timestamp. Completed games are dropped.
 */
async function fetchLeagueGames(sportKey: string): Promise<GameVM[]> {
  const path = SCOREBOARD_PATH[sportKey];
  if (!path) return [];

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dates = [ymd(today), ymd(tomorrow)];

  const seen = new Set<string>();
  const out: GameVM[] = [];

  const boards = await Promise.all(
    dates.map((dt) =>
      fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dt}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );

  for (const data of boards) {
    for (const ev of data?.events ?? []) {
      if (!ev?.id || seen.has(ev.id)) continue;

      const comp = ev.competitions?.[0];
      if (!comp) continue;

      const state: string | undefined = comp.status?.type?.state; // "pre" | "in" | "post"
      if (state === "post") continue; // game over — not shown in active/upcoming

      const home = comp.competitors?.find((c: any) => c.homeAway === "home");
      const away = comp.competitors?.find((c: any) => c.homeAway === "away");
      if (!home || !away) continue;

      const commence: string = ev.date;
      let bucket: Bucket | null = null;
      if (state === "in") bucket = "live";
      else if (isGameToday(commence)) bucket = "today";
      else if (isTomorrow(commence)) bucket = "tomorrow";
      if (!bucket) continue;

      seen.add(ev.id);
      const live = bucket === "live";
      const s = comp.situation;

      out.push({
        event: {
          // Shape compatible with OddsApiEvent so CreateTrigger can seed from it.
          // The id is ESPN's; CreateTrigger re-resolves the real Odds API event
          // by team name on open, so the id mismatch is harmless.
          id: ev.id,
          sport_key: sportKey,
          sport_title: leagueLabel(sportKey),
          commence_time: commence,
          home_team: home.team?.displayName ?? "",
          away_team: away.team?.displayName ?? "",
          bookmakers: [],
        },
        sportKey,
        bucket,
        homeScore: live ? toInt(home.score) : null,
        awayScore: live ? toInt(away.score) : null,
        liveDetail: live
          ? comp.status?.type?.shortDetail || comp.status?.type?.detail || "Live"
          : null,
        situation: s
          ? {
              balls: s.balls,
              strikes: s.strikes,
              outs: s.outs,
              onFirst: s.onFirst,
              onSecond: s.onSecond,
              onThird: s.onThird,
            }
          : null,
      });
    }
  }

  return out;
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
      const results = await Promise.all(LEAGUES.map((lg) => fetchLeagueGames(lg.sportKey).catch(() => [])));
      if (active) {
        setGames(results.flat());
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
  onSelectTeam,
}: {
  g: GameVM;
  logoFor: (name?: string | null) => string | null;
  onSelectTeam: (team: string) => void;
}) {
  const ev = g.event;
  const live = g.bucket === "live";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-1 px-1">
        {live ? (
          <span className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="text-red-500">● LIVE</span>
            {g.liveDetail ? <span className="font-semibold text-orange-500">· {g.liveDetail}</span> : null}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-gray-400">
            {g.bucket === "tomorrow" ? "Tomorrow · " : ""}
            {formatGameTime(ev.commence_time)}
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wide text-gray-400">{leagueLabel(g.sportKey)}</span>
      </div>

      <TeamRow name={ev.away_team} logo={logoFor(ev.away_team)} score={g.awayScore} live={live} onClick={() => onSelectTeam(ev.away_team)} />
      <div className="h-px bg-gray-100 mx-1" />
      <TeamRow name={ev.home_team} logo={logoFor(ev.home_team)} score={g.homeScore} live={live} onClick={() => onSelectTeam(ev.home_team)} />

      {live && g.situation ? <SituationStrip situation={g.situation} /> : null}
    </div>
  );
}

function TeamRow({
  name,
  logo,
  score,
  live,
  onClick,
}: {
  name: string;
  logo: string | null;
  score: number | null;
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
      {live && score !== null ? (
        <span className="w-6 shrink-0 text-right text-base font-bold tabular-nums text-gray-900">{score}</span>
      ) : null}
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
