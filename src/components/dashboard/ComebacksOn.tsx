import { useEffect, useMemo, useState } from "react";
import { LEAGUES, leagueLabel } from "@/lib/leagues";
import { formatOdds } from "@/lib/gameUtils";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { TeamLogoImg } from "./TeamLogoImg";
import { LeaguePills } from "./LeaguePills";

interface Comeback {
  event_id: string;
  sport_key: string;
  league_key: string;
  favorite_team: string;
  opponent_team: string;
  opening_ml: number | null;
  current_ml: number | null;
  favorite_score: number;
  opponent_score: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status_detail: string;
  commence_time: string;
}

export interface ComebackSelection {
  sportKey: string;
  team: string;
}

export function ComebacksOn({ onSelect, refreshSignal }: { onSelect: (sel: ComebackSelection) => void; refreshSignal?: number }) {
  const [league, setLeague] = useState("all");
  const [items, setItems] = useState<Comeback[]>([]);
  const [loading, setLoading] = useState(true);
  const { logoFor } = useTeamLogos();

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/odds/comebacks");
        const json = await res.json();
        if (active) setItems(json.comebacks || []);
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshSignal]);

  const matchesLeague = (c: Comeback, sportKey: string) => c.sport_key === sportKey || c.league_key === sportKey;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    LEAGUES.forEach((l) => { c[l.sportKey] = items.filter((i) => matchesLeague(i, l.sportKey)).length; });
    return c;
  }, [items]);

  const pills = [
    { key: "all", label: "All", count: counts.all },
    ...LEAGUES.map((l) => ({ key: l.sportKey, label: l.label, count: counts[l.sportKey] || 0 })),
  ];
  const filtered = league === "all" ? items : items.filter((i) => matchesLeague(i, league));

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-3">Comeback&apos;s On</h2>
      <div className="mb-4">
        <LeaguePills pills={pills} value={league} onChange={setLeague} />
      </div>
      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-6">
          No comebacks brewing right now. Opening lines are captured during the daily sync, so this fills in as games go live.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <button
              key={c.event_id}
              type="button"
              onClick={() => onSelect({ sportKey: c.sport_key, team: c.favorite_team })}
              className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm hover:border-gray-300 transition w-full"
            >
              <div className="flex items-start justify-between mb-3 gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamLogoImg url={logoFor(c.favorite_team)} alt={c.favorite_team} className="h-6 w-6 shrink-0 object-contain" />
                  <span className="font-bold text-gray-900 truncate">{c.favorite_team}</span>
                </span>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Start {formatOdds(c.opening_ml)}</div>
                  <div className="text-sm font-bold text-green-600">Live {formatOdds(c.current_ml)}</div>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <ScoreRow name={c.away_team} logo={logoFor(c.away_team)} score={c.away_score} />
                <ScoreRow name={c.home_team} logo={logoFor(c.home_team)} score={c.home_score} />
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] font-bold text-red-500">
                  ● LIVE <span className="text-gray-400 font-medium">{c.status_detail}</span>
                </span>
                <span className="text-[10px] uppercase tracking-wide text-gray-400">{leagueLabel(c.sport_key)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ScoreRow({ name, logo, score }: { name: string; logo: string | null; score: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        <TeamLogoImg url={logo} alt={name} className="h-4 w-4 shrink-0 object-contain" />
        <span className="text-gray-700 truncate">{name}</span>
      </span>
      <span className="font-bold text-gray-900 tabular-nums">{score}</span>
    </div>
  );
}
