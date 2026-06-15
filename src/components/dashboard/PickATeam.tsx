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

export function PickATeam({ onSelectTeam }: { onSelectTeam: (sel: TeamSelection) => void }) {
  const [league, setLeague] = useState<string>("all");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const rowRef = useRef<HTMLDivElement>(null);
  const { logoFor } = useTeamLogos();

  // Load all teams once; filter/breakdown happen client-side (case-insensitive),
  // so it works regardless of how league is cased in the DB ("NBA" vs "nba").
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

  // Reset scroll to the start when the league filter changes.
  useEffect(() => {
    rowRef.current?.scrollTo({ left: 0 });
  }, [league]);

  const teamLeagueOf = (t: Team) => (t.league || "").toLowerCase();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: teams.length };
    LEAGUES.forEach((l) => {
      c[l.sportKey] = teams.filter((t) => teamLeagueOf(t) === l.teamLeague).length;
    });
    return c;
  }, [teams]);

  const pills = [
    { key: "all", label: "All", count: counts.all },
    ...LEAGUES.map((l) => ({ key: l.sportKey, label: l.label, count: counts[l.sportKey] || 0 })),
  ];

  const selectedTeamLeague = LEAGUES.find((l) => l.sportKey === league)?.teamLeague;
  const filtered =
    league === "all" || !selectedTeamLeague
      ? teams
      : teams.filter((t) => teamLeagueOf(t) === selectedTeamLeague);

  const sportKeyForTeam = (t: Team) =>
    LEAGUES.find((l) => l.teamLeague === teamLeagueOf(t))?.sportKey ?? "";

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
              onClick={() => onSelectTeam({ sportKey: sportKeyForTeam(t), team: t.name, teamId: t.id })}
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
