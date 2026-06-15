import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, LogOut, Check, TrendingUp } from "lucide-react";
import { TelegramLoginButton } from "@/components/auth/TelegramLoginButton";
import { profileService } from "@/services/profileService";
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
      await profileService.updateProfile(profile.id, { preferred_sportsbook: value } as any);
      await refreshProfile();
    } catch (e) {
      console.error("[Settings] Failed to update sportsbook preference", e);
    } finally {
      setSavingBook(null);
    }
  };

  const isTelegramConnected = !!profile?.telegram_chat_id;

  return (
    <div className="space-y-6">
      {/* Telegram Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Telegram Notifications</CardTitle>
                <CardDescription>
                  Get instant alerts directly in Telegram
                </CardDescription>
              </div>
            </div>
            {isTelegramConnected && (
              <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isTelegramConnected ? (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Telegram Username</span>
                  <span className="text-sm text-muted-foreground">
                    @{profile.telegram_username || "Not set"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Name</span>
                  <span className="text-sm text-muted-foreground">
                    {profile.telegram_first_name}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                ✅ You're all set! Alerts will be sent to your Telegram account.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your Telegram account to receive instant alerts when your triggers hit.
                  No phone number required!
                </p>
                <TelegramLoginButton
                  authUrl="https://www.hammer-app.com/dashboard?settings=telegram"
                  buttonSize="medium"
                  usePic={false}
                />
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  💡 Without Telegram connected, alerts will be sent via email (if configured)
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
