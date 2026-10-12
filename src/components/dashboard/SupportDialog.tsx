import { useEffect, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Mode = "once" | "monthly" | "yearly";

const PRESETS: Record<Mode, number[]> = {
  once: [5, 10, 20],
  monthly: [5, 10, 20],
  yearly: [50, 100],
};
const SUFFIX: Record<Mode, string> = { once: "", monthly: "/mo", yearly: "/yr" };

/**
 * Pay-what-you-want support, one-time or recurring, via Whop checkout.
 * Recurring supporters get the supporter perks; one-time tips get a 30-day badge.
 */
export function SupportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("monthly");
  const [amount, setAmount] = useState<number>(10);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(PRESETS[mode][1] ?? PRESETS[mode][0]);
    setCustom("");
    setError(null);
  }, [mode]);

  const value = custom ? Number(custom) : amount;
  const valid = Number.isFinite(value) && value >= 3 && value <= 500;

  const go = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/support/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, mode }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || "Couldn't start checkout");
      window.location.href = j.url;
    } catch (e: any) {
      setError(e?.message || "Couldn't start checkout");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Support Hammer 💚</DialogTitle>
          <DialogDescription>
            Hammer is independent, and support covers live odds data and hosting. Pay what you want.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div role="tablist" className="inline-flex w-full rounded-xl bg-gray-100 p-1">
            {([
              ["once", "One-time"],
              ["monthly", "Monthly"],
              ["yearly", "Yearly"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={mode === k}
                onClick={() => setMode(k)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  mode === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS[mode].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setAmount(p);
                  setCustom("");
                }}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  !custom && amount === p ? "border-green-500 bg-green-500 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                ${p}
                {SUFFIX[mode]}
              </button>
            ))}
            <label className={`flex items-center rounded-full border px-3 py-1.5 text-sm ${custom ? "border-green-500" : "border-gray-200"}`}>
              <span className="text-gray-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={3}
                max={500}
                placeholder="Other"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="w-16 bg-transparent px-1 outline-none"
              />
              <span className="text-gray-400">{SUFFIX[mode]}</span>
            </label>
          </div>

          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {mode === "once" ? (
              <>A one-time tip gets you a supporter badge for 30 days.</>
            ) : (
              <>
                Supporters get <strong>up to 25 active triggers</strong> and a supporter badge. Cancel any time on Whop.
              </>
            )}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {!valid && (custom || value) ? <p className="text-xs text-gray-500">Enter an amount between $3 and $500.</p> : null}

          <Button className="w-full bg-green-500 hover:bg-green-600 text-white" disabled={!valid || busy} onClick={go}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Continue to checkout · $${valid ? value : "–"}${SUFFIX[mode]}`}
          </Button>

          <p className="text-[11px] leading-snug text-gray-400">
            Secure checkout by Whop. Supporting Hammer does not purchase bets or picks. Hammer is an informational alert
            tool, not a sportsbook. 21+.{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
