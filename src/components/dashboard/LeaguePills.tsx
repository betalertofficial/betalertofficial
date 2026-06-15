import { cn } from "@/lib/utils";

export interface LeaguePill {
  key: string;
  label: string;
  count?: number;
}

export function LeaguePills({
  pills,
  value,
  onChange,
}: {
  pills: LeaguePill[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
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
