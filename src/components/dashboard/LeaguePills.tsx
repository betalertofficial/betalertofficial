import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface LeaguePill {
  key: string;
  label: string;
  count?: number;
}

/**
 * League filter pills.
 *
 * Pills with a count of 0 are hidden so nobody taps into an empty league (e.g.
 * NBA before its season starts). The "All" pill is kept as the reset option,
 * but the whole row is hidden when fewer than two leagues have anything —
 * with one (or zero) leagues, a filter adds nothing. If the selected league
 * drops to 0 (after a refresh), selection snaps back to "All".
 */
export function LeaguePills({
  pills,
  value,
  onChange,
}: {
  pills: LeaguePill[];
  value: string;
  onChange: (key: string) => void;
}) {
  const leaguePills = pills.filter((p) => p.key !== "all" && (p.count === undefined || p.count > 0));
  const allPill = pills.find((p) => p.key === "all");
  const showRow = leaguePills.length >= 2;
  const visible = showRow ? [...(allPill ? [allPill] : []), ...leaguePills] : [];

  useEffect(() => {
    if (value === "all") return;
    const stillVisible = visible.some((p) => p.key === value);
    if (!stillVisible) onChange("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, visible.map((p) => p.key).join(",")]);

  if (!showRow) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
            value === p.key
              ? "bg-green-500 text-white border-green-500"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
          )}
        >
          {p.label}
          {p.count !== undefined ? ` (${p.count})` : ""}
        </button>
      ))}
    </div>
  );
}
