import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { MyTriggers } from "@/components/dashboard/MyTriggers";
import { Settings } from "@/components/dashboard/Settings";
import { PickATeam } from "@/components/dashboard/PickATeam";
import { ActiveGames } from "@/components/dashboard/ActiveGames";
import { ComebacksOn } from "@/components/dashboard/ComebacksOn";
import { TrendsSection } from "@/components/dashboard/TrendsSection";
import { CreateTrigger } from "@/components/dashboard/CreateTrigger";
import type { GameCardData } from "@/components/dashboard/GameCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { User, RefreshCw, Loader2 } from "lucide-react";
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
  // From a Trends card: open on the bet the trend points at.
  betType?: "moneyline" | "totals";
  totalSide?: "over" | "under";
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
  // Bumping this re-fetches the main dashboard data sections (Pick a Team,
  // Active & Upcoming Games, Comeback's On).
  const [dataRefresh, setDataRefresh] = useState(0);
  const [dataRefreshing, setDataRefreshing] = useState(false);

  const refreshDashboardData = () => {
    setDataRefresh((n) => n + 1);
    setDataRefreshing(true);
    setTimeout(() => setDataRefreshing(false), 900);
  };

  // Handle the Telegram login redirect (?id=…&hash=…). Runs once per page
  // load: a ref guard stops the effect from re-POSTing the same login when
  // state changes, and the URL params are cleared before the request.
  const telegramAuthStarted = useRef(false);
  useEffect(() => {
    if (!router.isReady || telegramAuthStarted.current) return;
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = router.query;
    if (!id || !hash) return;
    telegramAuthStarted.current = true;
    setIsTelegramAuthenticating(true);

    (async () => {
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

        if (!response.ok) {
          // Surface the server's real failure reason (short `reason` code).
          let reason = "";
          try {
            const body = await response.json();
            reason = body?.reason || body?.error || "";
          } catch {
            /* non-JSON error body */
          }
          console.error(`[Dashboard] Telegram auth failed (HTTP ${response.status})`, reason || "(no reason)");
          throw new Error(reason || `HTTP ${response.status}`);
        }

        // Full reload so auth state starts fresh from the new session cookie;
        // the welcome toast is shown after the reload (see below).
        try {
          sessionStorage.setItem("hammer_welcome", (first_name as string) || "there");
        } catch {
          /* storage unavailable */
        }
        window.location.replace("/dashboard");
      } catch (error) {
        console.error("Telegram auth error:", error);
        const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
        toast({
          title: "Authentication Error",
          description: `Couldn't sign in with Telegram${detail}. Please try again.`,
          variant: "destructive",
        });
        router.replace("/dashboard", undefined, { shallow: true });
        setIsTelegramAuthenticating(false);
      }
    })();
  }, [router.isReady, router.query, router, toast]);

  // Welcome toast after a fresh Telegram login (set right before the reload).
  useEffect(() => {
    if (loading || !profile) return;
    let name: string | null = null;
    try {
      name = sessionStorage.getItem("hammer_welcome");
      if (name) sessionStorage.removeItem("hammer_welcome");
    } catch {
      /* storage unavailable */
    }
    if (name) {
      toast({ title: "Welcome! 🎯", description: `Logged in via Telegram as ${name}` });
    }
  }, [loading, profile, toast]);

  const openTrigger = (p: Prefill) => {
    setPrefill(p);
    setTriggerOpen(true);
  };

  // Login required: once auth has settled, anyone without a profile goes to
  // the homepage (the server middleware already bounces visitors with no
  // cookie; this covers expired or invalid sessions). The Telegram login
  // redirect (?id=…&hash=…) is excluded — it's mid-sign-in.
  const isTelegramReturn = Boolean(router.query.id && router.query.hash);
  const mustRedirect = router.isReady && !loading && !isTelegramAuthenticating && !profile && !isTelegramReturn;
  useEffect(() => {
    if (mustRedirect) router.replace("/");
  }, [mustRedirect, router]);

  if (loading || isTelegramAuthenticating || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">
            {isTelegramAuthenticating ? "Authenticating with Telegram..." : mustRedirect ? "Redirecting to sign in…" : "Loading..."}
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
          <div className="container mx-auto px-4 lg:max-w-none lg:pr-8 lg:pl-[calc((100vw-1024px)/2+1rem)] xl:pl-[calc((100vw-1280px)/2+1rem)] 2xl:pl-[calc((100vw-1536px)/2+1rem)] h-14 flex items-center justify-between">
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

        <div className="container mx-auto px-4 lg:max-w-none lg:pr-8 lg:pl-[calc((100vw-1024px)/2+1rem)] xl:pl-[calc((100vw-1280px)/2+1rem)] 2xl:pl-[calc((100vw-1536px)/2+1rem)] py-8">
          <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
            {/* Main column: live data sections */}
            <div className="space-y-10 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
                  <p className="text-muted-foreground mt-1">Manage your betting triggers and track your alerts</p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Refresh games & odds"
                  aria-label="Refresh dashboard data"
                  disabled={dataRefreshing}
                  onClick={refreshDashboardData}
                >
                  {dataRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>

              <PickATeam onSelectTeam={openTrigger} refreshSignal={dataRefresh} />
              <ActiveGames onSelectGame={openTrigger} refreshSignal={dataRefresh} />
              <TrendsSection onSelect={openTrigger} refreshSignal={dataRefresh} />
              <ComebacksOn onSelect={openTrigger} refreshSignal={dataRefresh} />
            </div>

            {/* Right column: My Triggers drawer. A full-height divider separates it
                from the dashboard (top border when stacked on mobile); the inner
                wrapper stays sticky while the divider runs the column's length. */}
            <aside className="self-stretch border-t border-gray-200 pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
              <div className="lg:sticky lg:top-20">
                <MyTriggers refreshSignal={triggerRefresh} />
              </div>
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
        initialBetType={prefill.betType}
        initialTotalSide={prefill.totalSide}
        onSuccess={() => {
          setTriggerOpen(false);
          setTriggerRefresh((n) => n + 1);
        }}
      />
    </>
  );
}
