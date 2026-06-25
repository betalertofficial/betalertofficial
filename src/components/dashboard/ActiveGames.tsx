import { useEffect, useMemo, useState } from "react";
import { oddsApiService, type OddsApiEvent } from "@/services/oddsApiService";
import { LEAGUES, leagueLabel } from "@/lib/leagues";
import { isGameToday, formatGameTime, getTeamMoneyline } from "@/lib/gameUtils";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import type { EspnSituation } from "@/hooks/useEspnLive";
import { GameCard, type GameCardData } from "./GameCard";
import { LeaguePills } from "./LeaguePills";
import { ChevronDown, ChevronUp } from "lucide-react";

type Bucket = "live" | "today" | "tomorrow";

interface GameVM {
  event: OddsApiEvent;
  sportKey: string;
  bucket: Bucket;
  homeScore: number | null;
  awayScore: number | null;
  // Per-team moneyline (h2h), enriched from the Odds API after the ESPN grid
  // loads. null until loaded / when no line is available.
  homeMl: number | null;
  awayMl: number | null;
  // Live status detail straight from ESPN, e.g. "Top 7th", "Q3 5:21", "63'".
  liveDetail: string | null;
  // MLB only: balls/strikes/outs + bases, from ESPN competition.situation.
  situation: EspnSituation | null;
}

export interface GameSelection {
  sportKey: string;
  team: string;
  event: OddsApiEvent;
  // The exact card the user tapped, so the modal can render it identically.
  card: GameCardData;
}

// Odds API sport key (used everywhere else in the app + by the cron) -> ESPN
// scoreboard path. The dashboard sources the game grid from ESPN (free) for
// matchups/scores/state and enriches with a lean h2h-only Odds API call for the
// moneyline; the Odds API sportKey is still what we hand to CreateTrigger so
// trigger creation + cron matching are unaffected.
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

// Loose, bidirectional team-name match (ESPN displayName vs Odds API name).
// Both sources use identical canonical names for US leagues + country names for
// the World Cup, so substring matching is safe and tolerant of minor variants.
function nameMatch(a: string, b: string): boolean {
  const x = (a || "").toLowerCase();
  const y = (b || "").toLowerCase();
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

// Find a team's moneyline across a league's Odds API events. Reads the line
// using the Odds API's own team names (exact-match inside getTeamMoneyline) once
// we've located the event by substring, so name variants never break the lookup.
function findMoneyline(events: OddsApiEvent[], teamName: string): number | null {
  for (const e of events) {
    if (nameMatch(e.home_team, teamName)) {
      const m = getTeamMoneyline(e, e.home_team);
      if (m !== null) return m;
    }
    if (nameMatch(e.away_team, teamName)) {
      const m = getTeamMoneyline(e, e.away_team);
      if (m !== null) return m;
    }
  }
  return null;
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
        homeMl: null,
        awayMl: null,
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

      // Phase 1: build the grid from ESPN (free) and render immediately.
      const espnGames = (await Promise.all(LEAGUES.map((lg) => fetchLeagueGames(lg.sportKey).catch(() => [])))).flat();
      if (!active) return;
      setGames(espnGames);
      setLoading(false);

      // Phase 2: enrich with the per-team moneyline via a lean h2h-only Odds API
      // call — and ONLY for leagues that actually have games right now (so
      // out-of-season leagues cost 0 credits). Cards update in place as it lands.
      const activeSportKeys = Array.from(new Set(espnGames.map((g) => g.sportKey)));
      if (activeSportKeys.length === 0) return;

      const oddsPairs = await Promise.all(
        activeSportKeys.map((sk) =>
          oddsApiService
            .getOddsForSport(sk, "h2h")
            .then((evs) => [sk, evs] as const)
            .catch(() => [sk, [] as OddsApiEvent[]] as const)
        )
      );
      if (!active) return;

      const oddsBySport = new Map<string, OddsApiEvent[]>(oddsPairs);
      setGames((prev) =>
        prev.map((g) => {
          const evs = oddsBySport.get(g.sportKey);
          if (!evs || evs.length === 0) return g;
          return {
            ...g,
            homeMl: findMoneyline(evs, g.event.home_team),
            awayMl: findMoneyline(evs, g.event.away_team),
          };
        })
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  // Build the fully-resolved card view-model (logos + formatted time) so the same
  // object renders the dashboard card AND seeds the Create Trigger modal header.
  const cardData = (g: GameVM): GameCardData => ({
    sportKey: g.sportKey,
    awayTeam: g.event.away_team,
    homeTeam: g.event.home_team,
    awayLogo: logoFor(g.event.away_team),
    homeLogo: logoFor(g.event.home_team),
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    awayMl: g.awayMl,
    homeMl: g.homeMl,
    live: g.bucket === "live",
    liveDetail: g.liveDetail,
    timeLabel:
      g.bucket === "tomorrow"
        ? `Tomorrow · ${formatGameTime(g.event.commence_time)}`
        : formatGameTime(g.event.commence_time),
    situation: g.situation,
  });

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

  const renderCard = (g: GameVM) => {
    const data = cardData(g);
    return (
      <GameCard
        key={g.event.id}
        data={data}
        onSelectTeam={(team) => onSelectGame({ sportKey: g.sportKey, team, event: g.event, card: data })}
      />
    );
  };

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
              {liveAndToday.map(renderCard)}
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
                  {tomorrow.map(renderCard)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
