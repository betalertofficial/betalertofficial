import { useEffect, useState } from "react";
import { teamsService, type Team } from "@/services/teamsService";
import { LEAGUES, getTeamLogoUrl } from "@/lib/leagues";
import { LeaguePills } from "./LeaguePills";

export interface TeamSelection {
  sportKey: string;
  team: string;
  teamId: string;
}

export function PickATeam({ onSelectTeam }: { onSelectTeam: (sel: TeamSelection) => void }) {
  const [league, setLeague] = useState<string>("all");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const teamLeague = LEAGUES.find((l) => l.sportKey === league)?.teamLeague;
        const data =
          league === "all" || !teamLeague
            ? await teamsService.getAllTeams()
            : await teamsService.getTeamsByLeague(teamLeague);
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
  }, [league]);

  const pills = [{ key: "all", label: "All" }, ...LEAGUES.map((l) => ({ key: l.sportKey, label: l.label }))];

  const sportKeyForTeam = (t: Team) =>
    LEAGUES.find((l) => l.teamLeague === (t.league || "").toLowerCase())?.sportKey ?? "";

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-3">Pick a Team</h2>
      <div className="mb-4">
        <LeaguePills pills={pills} value={league} onChange={setLeague} />
      </div>
      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading teams…</div>
      ) : teams.length === 0 ? (
        <div className="text-sm text-gray-400 py-6">No teams for this league yet.</div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTeam({ sportKey: sportKeyForTeam(t), team: t.name, teamId: t.id })}
              className="flex flex-col items-center gap-2 p-2 rounded-xl border border-gray-200 bg-white hover:shadow-sm hover:border-gray-300 transition"
            >
              <TeamLogo team={t} />
              <span className="text-[11px] text-gray-600 text-center leading-tight line-clamp-2">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamLogo({ team }: { team: Team }) {
  const [errored, setErrored] = useState(false);
  const url = getTeamLogoUrl(team.league, team.abbrev);

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
