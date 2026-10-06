import { useEffect, useState } from "react";
import type { MatchupTrends, OURecord, TeamTrend } from "@/lib/trends";

/**
 * Team W/L + Over/Under trends for a matchup, shown under the game card in the
 * Create Trigger modal. Data: /api/trends/matchup (ESPN game history, free).
 *
 * `line` = today's total (from the live odds), so each window can also say how
 * often it would have gone over today's number — the figure most useful when
 * setting a totals alert.
 */

const UNIT: Record<string, string> = {
  baseball_mlb: "runs",
  icehockey_nhl: "goals",
  basketball_nba: "pts",
  americanfootball_nfl: "pts",
};

function shortName(full: string) {
  // "Los Angeles Dodgers" → "Dodgers"; keep two words for e.g. "Red Sox", "Blue Jays".
  const parts = full.trim().split(/\s+/);
  const two = ["Sox", "Jays", "Knights", "Wings", "Leafs", "Jackets", "Blazers"];
  if (parts.length >= 2 && two.includes(parts[parts.length - 1])) return parts.slice(-2).join(" ");
  return parts[parts.length - 1] || full;
}

function ouText(r: OURecord) {
  return r.push > 0 ? `${r.over}-${r.under}-${r.push}` : `${r.over}-${r.under}`;
}

function ouTone(r: OURecord) {
  const n = r.over + r.under;
  if (n < 4) return "text-gray-700";
  if (r.over / n >= 0.7) return "text-green-600";
  if (r.under / n >= 0.7) return "text-red-600";
  return "text-gray-700";
}

function rateTone(hit: number, of: number) {
  if (of < 4) return "text-gray-700";
  const p = hit / of;
  if (p >= 0.7) return "text-green-600";
  if (p <= 0.3) return "text-red-600";
  return "text-gray-700";
}

function TeamRow({ t, unit }: { t: TeamTrend; unit: string }) {
  const rec = t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;
  return (
    <tr className="border-t border-gray-100">
      <td className="py-1.5 pr-2 font-semibold text-gray-900 truncate max-w-[92px]">{shortName(t.team)}</td>
      <td className={`py-1.5 px-1 tabular-nums ${t.wins > t.losses ? "text-green-600" : t.losses > t.wins ? "text-red-600" : "text-gray-700"}`}>{rec}</td>
      <td className="py-1.5 px-1 tabular-nums text-gray-700">
        {t.venueGames > 0 ? `${t.venueWins}-${t.venueLosses}` : "–"}
      </td>
      <td className={`py-1.5 px-1 tabular-nums ${ouTone(t.ou)}`}>{t.ou.over + t.ou.under + t.ou.push > 0 ? ouText(t.ou) : "–"}</td>
      <td className="py-1.5 pl-1 tabular-nums text-gray-700 text-right">
        {t.avgTotal != null ? t.avgTotal : "–"}
        <span className="text-[10px] text-gray-400"> {unit}</span>
      </td>
    </tr>
  );
}

export function TrendsPanel({
  sportKey,
  homeTeam,
  awayTeam,
  line,
}: {
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  line: number | null;
}) {
  const [data, setData] = useState<MatchupTrends | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sportKey || !homeTeam || !awayTeam) return;
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams({ sport: sportKey, home: homeTeam, away: awayTeam });
    if (line != null) qs.set("line", String(line));
    fetch(`/api/trends/matchup?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => active && setData(j))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sportKey, homeTeam, awayTeam, line]);

  if (loading) return <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-400">Loading trends…</div>;
  if (!data || (!data.home && !data.away)) return null;

  const unit = UNIT[sportKey] ?? "pts";
  const { window: n, h2h } = data;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Trends</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Last {n} games</span>
      </div>

      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400">
            <th className="text-left font-medium pb-1 w-[30%]"></th>
            <th className="text-left font-medium pb-1 px-1">W-L</th>
            <th className="text-left font-medium pb-1 px-1">Venue</th>
            <th className="text-left font-medium pb-1 px-1">O/U</th>
            <th className="text-right font-medium pb-1 pl-1">Avg total</th>
          </tr>
        </thead>
        <tbody>
          {data.away ? <TeamRow t={data.away} unit={unit} /> : null}
          {data.home ? <TeamRow t={data.home} unit={unit} /> : null}
        </tbody>
      </table>
      <p className="mt-0.5 text-[10px] text-gray-400">
        Venue = {data.away ? `${shortName(data.away.team)} on the road` : ""}
        {data.away && data.home ? ", " : ""}
        {data.home ? `${shortName(data.home.team)} at home` : ""}. O/U vs each game&apos;s closing total.
      </p>

      {h2h ? (
        <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-700">
          <span className="font-semibold text-gray-500">Head-to-head</span>{" "}
          <span className="text-gray-400">(last {h2h.games})</span>
          {": "}
          {data.home ? shortName(data.home.team) : "Home"} {h2h.homeWins}-{h2h.awayWins}
          {h2h.ou.over + h2h.ou.under + h2h.ou.push > 0 ? (
            <>
              {" · "}O/U <span className={ouTone(h2h.ou)}>{ouText(h2h.ou)}</span>
            </>
          ) : null}
          {h2h.avgTotal != null ? <> · Avg {h2h.avgTotal} {unit}</> : null}
        </div>
      ) : null}

      {data.line != null ? (
        <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-700">
          <span className="font-semibold">Today&apos;s total {data.line}</span>
          <span className="text-gray-400"> — went over in</span>{" "}
          {[data.away, data.home].filter(Boolean).map((t, i) => (
            <span key={t!.team}>
              {i > 0 ? " · " : ""}
              <span className={`font-semibold tabular-nums ${rateTone(t!.overToday ?? 0, t!.games)}`}>
                {t!.overToday}/{t!.games}
              </span>{" "}
              {shortName(t!.team)}
            </span>
          ))}
          {h2h && h2h.overToday != null ? (
            <>
              {" · "}
              <span className={`font-semibold tabular-nums ${rateTone(h2h.overToday, h2h.games)}`}>
                {h2h.overToday}/{h2h.games}
              </span>{" "}
              H2H
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
