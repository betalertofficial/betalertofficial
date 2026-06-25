import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { MyTriggers } from "@/components/dashboard/MyTriggers";
import { Settings } from "@/components/dashboard/Settings";
import { PickATeam } from "@/components/dashboard/PickATeam";
import { ActiveGames } from "@/components/dashboard/ActiveGames";
import { ComebacksOn } from "@/components/dashboard/ComebacksOn";
import { CreateTrigger } from "@/components/dashboard/CreateTrigger";
import type { GameCardData } from "@/components/dashboard/GameCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";

interface Prefill {
  sportKey?: string;
  team?: string;
  teamId?: string;
  event?: any;
  // Present when opened from an Active Games card — lets the modal render the
  // exact same card as its header.
  card?: GameCardData;
}

export default function Dashboard() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const { toast } = useToast();
  const [isTelegramAuthenticating, setIsTelegramAuthenticating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>({});
  const [triggerRefresh, setTriggerRefresh] = useState(0);

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

  const openTrigger = (p: Prefill) => {
    setPrefill(p);
    setTriggerOpen(true);
  };

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
      <SEO title="Dashboard - Hammer" description="Manage your betting triggers and track your alerts" />

      <div className="min-h-screen bg-gray-50">
        {/* Top nav */}
        <header className="border-b border-gray-200 bg-white sticky top-0 z-30">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            <span className="font-bold text-lg tracking-tight">Hammer</span>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
            >
              {profile?.telegram_first_name ? (
                <span className="text-sm font-semibold">{profile.telegram_first_name.charAt(0).toUpperCase()}</span>
              ) : (
                <User className="h-5 w-5" />
              )}
            </Button>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
            {/* Main column: live data sections */}
            <div className="space-y-10 min-w-0">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
                <p className="text-muted-foreground mt-1">Manage your betting triggers and track your alerts</p>
              </div>

              <PickATeam onSelectTeam={openTrigger} />
              <ActiveGames onSelectGame={openTrigger} />
              <ComebacksOn onSelect={openTrigger} />
            </div>

            {/* Right column: My Triggers drawer */}
            <aside className="lg:sticky lg:top-20">
              <MyTriggers refreshSignal={triggerRefresh} />
            </aside>
          </div>
        </div>
      </div>

      {/* Settings sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>
              {profile?.telegram_first_name ? `Hi, ${profile.telegram_first_name} 👋` : "Settings"}
            </SheetTitle>
          </SheetHeader>
          <Settings />
        </SheetContent>
      </Sheet>

      {/* Create Trigger modal — opened pre-filled when a team/game/comeback is clicked */}
      <CreateTrigger
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        initialSport={prefill.sportKey}
        initialTeam={prefill.team}
        initialTeamId={prefill.teamId}
        initialEvent={prefill.event}
        initialCard={prefill.card}
        onSuccess={() => {
          setTriggerOpen(false);
          setTriggerRefresh((n) => n + 1);
        }}
      />
    </>
  );
}
