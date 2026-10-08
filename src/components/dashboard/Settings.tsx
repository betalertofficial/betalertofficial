import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Check, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const SPORTSBOOK_OPTIONS = [
  { value: "draftkings", label: "DraftKings" },
  { value: "fanduel", label: "FanDuel" },
  { value: "best", label: "Whichever has better odds" },
];

export function Settings() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [savingBook, setSavingBook] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
  };

  const currentBook = (profile as any)?.preferred_sportsbook || "best";

  const selectBook = async (value: string) => {
    if (!profile?.id || value === currentBook || savingBook) return;
    setSavingBook(value);
    try {
      // Server-side update (the profiles table no longer accepts browser writes).
      const r = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferred_sportsbook: value }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refreshProfile();
    } catch (e) {
      console.error("[Settings] Failed to update sportsbook preference", e);
    } finally {
      setSavingBook(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sportsbook Preference Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Sportsbook</CardTitle>
              <CardDescription>Which book we check your triggers against</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {SPORTSBOOK_OPTIONS.map((opt) => {
            const selected = currentBook === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectBook(opt.value)}
                disabled={!!savingBook}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition disabled:opacity-60",
                  selected
                    ? "border-green-500 bg-green-500/10 text-green-700 font-semibold"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <span>{opt.label}</span>
                {savingBook === opt.value ? (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                ) : selected ? (
                  <Check className="h-4 w-4" />
                ) : null}
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground pt-1">
            “Whichever has better odds” alerts you using the better payout of DraftKings/FanDuel for each trigger.
          </p>
        </CardContent>
      </Card>

      {/* Account Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleSignOut} className="w-full sm:w-auto">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
