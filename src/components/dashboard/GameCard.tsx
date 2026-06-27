import type { EspnSituation } from "@/hooks/useEspnLive";
import type { TeamForm } from "@/hooks/useTeamForm";
import { leagueLabel } from "@/lib/leagues";
import { formatOdds } from "@/lib/gameUtils";
import { TeamLogoImg } from "./TeamLogoImg";
import { TeamFormBadge } from "./TeamFormBadge";

/**
 * Fully-resolved, serializable view-model for a game card. Built on the
 * dashboard (ActiveGames) and passed verbatim into the Create Trigger modal so
 * the modal header shows the exact same card the user tapped.
 */
export interface GameCardData {
  sportKey: string;
  awayTeam: string;
  homeTeam: string;
  awayLogo: string | null;
  homeLogo: string | null;
  awayScore: number | null;
  homeScore: number | null;
  awayMl: number | null;
  homeMl: number | null;
  live: boolean;
  /** Live status detail, e.g. "Top 7th", "Q3 5:21", "63'" (live games). */
  liveDetail: string | null;
  /** Pre-game time label, e.g. "7:15 PM" or "Tomorrow · 7:15 PM" (non-live). */
  timeLabel: string | null;
  /** Raw ISO commence time of this game — used to bind "once" triggers to it. */
  commenceTime: string;
  situation: EspnSituation | null;
  /** Recent-form ("hot/not") per team; null when unavailable. */
  awayForm?: TeamForm | null;
  homeForm?: TeamForm | null;
}

/**
 * The one game-card design, shared by the dashboard grid and the trigger modal.
 * - Pass `onSelectTeam` to make the team rows tappable (dashboard quick-create,
 *   or switching your pick inside the modal).
 * - Pass `selectedTeam` to highlight the chosen team (modal header).
 */
export function GameCard({
  data,
  selectedTeam,
  onSelectTeam,
  className = "",
}: {
  data: GameCardData;
  selectedTeam?: string;
  onSelectTeam?: (team: string) => void;
  className?: string;
}) {
  const { live } = data;

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-3 ${className}`}>
      <div className="flex items-center justify-between mb-1 px-1">
        {live ? (
          <span className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="text-red-500">● LIVE</span>
            {data.liveDetail ? <span className="font-semibold text-orange-500">· {data.liveDetail}</span> : null}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-gray-400">{data.timeLabel ?? ""}</span>
        )}
        <span className="text-[10px] uppercase tracking-wide text-gray-400">{leagueLabel(data.sportKey)}</span>
      </div>

      <TeamRow
        name={data.awayTeam}
        logo={data.awayLogo}
        score={data.awayScore}
        ml={data.awayMl}
        live={live}
        selected={!!selectedTeam && selectedTeam === data.awayTeam}
        onSelectTeam={onSelectTeam}
        form={data.awayForm ?? null}
      />
      <div className="h-px bg-gray-100 mx-1" />
      <TeamRow
        name={data.homeTeam}
        logo={data.homeLogo}
        score={data.homeScore}
        ml={data.homeMl}
        live={live}
        selected={!!selectedTeam && selectedTeam === data.homeTeam}
        onSelectTeam={onSelectTeam}
        form={data.homeForm ?? null}
      />

      {live && data.situation ? <SituationStrip situation={data.situation} /> : null}
    </div>
  );
}

function TeamRow({
  name,
  logo,
  score,
  ml,
  live,
  selected,
  onSelectTeam,
  form,
}: {
  name: string;
  logo: string | null;
  score: number | null;
  ml: number | null;
  live: boolean;
  selected: boolean;
  onSelectTeam?: (team: string) => void;
  form?: TeamForm | null;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <TeamLogoImg url={logo} alt={name} className="h-5 w-5 shrink-0 object-contain" />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-gray-900">{name}</span>
            {selected ? (
              <span className="shrink-0 rounded bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                Pick
              </span>
            ) : null}
          </span>
          {form ? <TeamFormBadge form={form} className="mt-0.5" /> : null}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {ml !== null ? <span className="text-xs tabular-nums text-gray-500">{formatOdds(ml)}</span> : null}
        {live && score !== null ? (
          <span className="w-6 text-right text-base font-bold tabular-nums text-gray-900">{score}</span>
        ) : null}
      </div>
    </>
  );

  const base = "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left";

  if (!onSelectTeam) {
    return <div className={`${base} ${selected ? "bg-gray-50" : ""}`}>{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelectTeam(name)}
      title={`Set an alert on ${name}`}
      className={`${base} transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 ${selected ? "bg-gray-50" : ""}`}
    >
      {inner}
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
