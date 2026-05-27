import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { TriggerStats } from "@/components/dashboard/TriggerStats";
import { MyTriggers } from "@/components/dashboard/MyTriggers";
import { Settings } from "@/components/dashboard/Settings";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const { toast } = useToast();
  const [isTelegramAuthenticating, setIsTelegramAuthenticating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Handle Telegram auth callback from URL params
  useEffect(() => {
    const handleTelegramAuth = async () => {
      const { id, first_name, last_name, username, photo_url, auth_date, hash } = router.query;

      if (!id || !hash || isTelegramAuthenticating) return;

      setIsTelegramAuthenticating(true);

      try {
        const response = await fetch("/api/auth/telegram-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: parseInt(id as string),
            first_name: first_name as string,
            last_name: last_name as string | undefined,
            username: username as string | undefined,
            photo_url: photo_url as string | undefined,
            auth_date: parseInt(auth_date as string),
            hash: hash as string,
          }),
        });

        if (!response.ok) throw new Error("Authentication failed");

        const result = await response.json();
        console.log("[Dashboard] Telegram auth successful:", result);

        toast({
          title: "Welcome! 🎯",
          description: `Logged in via Telegram as ${first_name}`,
        });

        window.location.href = "/dashboard";
      } catch (error) {
        console.error("Telegram auth error:", error);
        toast({
          title: "Authentication Error",
          description: "Failed to authenticate with Telegram. Please try again.",
          variant: "destructive",
        });
        router.replace("/dashboard", undefined, { shallow: true });
      } finally {
        setIsTelegramAuthenticating(false);
      }
    };

    handleTelegramAuth();
  }, [router.query, isTelegramAuthenticating, router, toast]);

  if (loading || isTelegramAuthenticating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">
            {isTelegramAuthenticating ? "Authenticating with Telegram..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Dashboard - Bet Alert"
        description="Manage your betting triggers and track your alerts"
      />

      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-8">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground mt-2">
                  Manage your betting triggers and track your alerts
                </p>
              </div>

              {/* Profile / Settings icon */}
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setSettingsOpen(true)}
                aria-label="Open settings"
              >
                {profile?.telegram_first_name ? (
                  <span className="text-sm font-semibold">
                    {profile.telegram_first_name.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User className="h-5 w-5" />
                )}
              </Button>
            </div>

            {/* Stats */}
            <TriggerStats active={0} completed={0} remaining={0} />

            {/* Triggers (active + completed tabs are inside MyTriggers itself) */}
            <MyTriggers />

          </div>
        </div>
      </div>

      {/* Settings sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>
              {profile?.telegram_first_name
                ? `Hi, ${profile.telegram_first_name} 👋`
                : "Settings"}
            </SheetTitle>
          </SheetHeader>
          <Settings />
        </SheetContent>
      </Sheet>
    </>
  );
}
