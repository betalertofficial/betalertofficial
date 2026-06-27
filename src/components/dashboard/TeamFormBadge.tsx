import type { TeamForm } from "@/hooks/useTeamForm";

/**
 * Compact recent-form chip ("hot/not"): a small colored record/streak.
 * green = winning recent form, red = losing, gray = even. Renders nothing
 * when no form is available (e.g. a team not in today's soccer slate).
 */
export function TeamFormBadge({ form, className = "" }: { form: TeamForm | null; className?: string }) {
  if (!form) return null;

  const tone =
    form.tone === "hot"
      ? "text-green-600"
      : form.tone === "cold"
      ? "text-red-500"
      : "text-gray-400";

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums ${tone} ${className}`} title={form.title}>
      <span>{form.label}</span>
      <span className="text-gray-400 font-medium">{form.suffix}</span>
    </span>
  );
}
