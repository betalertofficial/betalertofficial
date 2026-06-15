import { useEffect, useMemo, useRef, useState } from "react";
import { teamsService, type Team } from "@/services/teamsService";
import { LEAGUES, getTeamLogoUrl } from "@/lib/leagues";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { LeaguePills } from "./LeaguePills";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface TeamSelection {
  sportKey: string;
  team: string;
  teamId: string;
}

/**
 * Fallback league classifier from the teams table `league` column.
 * Format-proof: matches "nba"/"NBA"/"basketball_nba"/"National Basketball Association".
 * Primary classification is by team NAME via ESPN (see leagueFor); this is the
 * fallback when a name isn't found.
 */
function leagueToSportKey(value: string | null | undefined): string | null {
  const s = (value || "").toLowerCase();
  if (s.includes("nba") || s.includes("basketball")) return "basketball_nba";
  if (s.includes("mlb") || s.includes("baseball")) return "baseball_mlb";
  if (s.includes("nfl") || s.includes("americanfootball") || s.includes("football")) return "americanfootball_nfl";
  if (s.includes("nhl") || s.includes("hockey")) return "icehockey_nhl";
  if (s.includes("epl") || s.includes("soccer") || s.includes("premier")) return "soccer_epl";
  return null;
}

export function PickATeam({ onSelectTeam }: { onSelectTeam: (sel: TeamSelection) => void }) {
  const [league, setLeague] = useState<string>("all");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const rowRef = useRef<HTMLDivElement>(null);
  const { logoFor, leagueFor } = useTeamLogos();

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const data = await teamsService.getAllTeams();
        if (active) setTeams(data);
      } catch {
        if (active) setTeams([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    rowRef.current?.scrollTo({ left: 0 });
  }, [league]);

  // Classify each team by NAME (ESPN) first, then the DB league column.
  const sportKeyOf = (t: Team) => leagueFor(t.name) || leagueToSportKey(t.league);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: teams.length };
    LEAGUES.forEach((l) => {
      c[l.sportKey] = teams.filter((t) => sportKeyOf(t) === l.sportKey).length;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, leagueFor]);

  const pills = [
    { key: "all", label: "All", count: counts.all },
    ...LEAGUES.map((l) => ({ key: l.sportKey, label: l.label, count: counts[l.sportKey] || 0 })),
  ];

  const filtered = league === "all" ? teams : teams.filter((t) => sportKeyOf(t) === league);

  const slide = (dir: number) => rowRef.current?.scrollBy({ left: dir * 360, behavior: "smooth" });

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-gray-900">Pick a Team</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => slide(-1)}
            className="h-7 w-7 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            aria-label="Scroll teams left"
          >
            <ChevronLeft className="h-4 w-4 text-gray-500" />
          </button>
          <button
            type="button"
            onClick={() => slide(1)}
            className="h-7 w-7 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
            aria-label="Scroll teams right"
          >
            <ChevronRight className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="mb-4">
        <LeaguePills pills={pills} value={league} onChange={setLeague} />
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading teams…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-6">No teams for this league yet.</div>
      ) : (
        <div
          ref={rowRef}
          className="flex flex-nowrap gap-3 overflow-x-auto pb-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTeam({ sportKey: sportKeyOf(t) ?? "", team: t.name, teamId: t.id })}
              className="shrink-0 w-[84px] flex flex-col items-center gap-2 p-2 rounded-xl border border-gray-200 bg-white hover:shadow-sm hover:border-gray-300 transition"
            >
              <TeamLogo team={t} url={logoFor(t.name) || getTeamLogoUrl(t.league, t.abbrev)} />
              <span className="text-[11px] text-gray-600 text-center leading-tight line-clamp-2">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamLogo({ team, url }: { team: Team; url: string | null }) {
  const [errored, setErrored] = useState(false);

  if (url && !errored) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={team.name}
        className="h-10 w-10 object-contain"
        loading="lazy"
        onError={() => setErrored(true)}
      />
    );
  }

  const initials = (team.abbrev || team.name.split(" ").map((w) => w[0]).join("")).slice(0, 3).toUpperCase();
  return (
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
      style={{ backgroundColor: team.primary_color || "#64748b" }}
    >
      {initials}
    </div>
  );
}
