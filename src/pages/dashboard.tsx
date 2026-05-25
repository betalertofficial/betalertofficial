import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateTrigger } from "@/components/dashboard/CreateTrigger";
import { MyTriggers } from "@/components/dashboard/MyTriggers";
import { History } from "@/components/dashboard/History";
import { Settings } from "@/components/dashboard/Settings";
import { TriggerStats } from "@/components/dashboard/TriggerStats";
import { Bell, Target, Clock, Settings as SettingsIcon, Plus } from "lucide-react";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const { toast } = useToast();
  const [isTelegramAuthenticating, setIsTelegramAuthenticating] = useState(false);
  const [activeTab, setActiveTab] = useState("create");

  // Handle Telegram auth callback from URL params
  useEffect(() => {
    const handleTelegramAuth = async () => {
      // Check if URL has Telegram auth params
      const { id, first_name, last_name, username, photo_url, auth_date, hash } = router.query;
      
      if (!id || !hash || isTelegramAuthenticating) return;

      setIsTelegramAuthenticating(true);

      try {
        // Send auth data to backend for verification
        const response = await fetch("/api/auth/telegram-callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
          throw new Error("Authentication failed");
        }

        const result = await response.json();
        console.log("[Dashboard] Telegram auth successful:", result);

        toast({
          title: "Welcome! 🎯",
          description: `Logged in via Telegram as ${first_name}`,
        });

        // Clean URL and reload to pick up new session
        window.location.href = "/dashboard";
      } catch (error) {
        console.error("Telegram auth error:", error);
        toast({
          title: "Authentication Error",
          description: "Failed to authenticate with Telegram. Please try again.",
          variant: "destructive",
        });
        
        // Clean URL params even on error
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
              <Button 
                size="lg" 
                onClick={() => {
                  console.log("Create Trigger button clicked, switching to create tab");
                  setActiveTab("create");
                }}
                className="gap-2"
              >
                <Plus className="h-5 w-5" />
                Create Trigger
              </Button>
            </div>

            {/* Stats Overview */}
            <TriggerStats active={0} completed={0} remaining={0} />

            {/* Main Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
                <TabsTrigger value="create" className="gap-2">
                  <Target className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Trigger</span>
                  <span className="sm:hidden">Create</span>
                </TabsTrigger>
                <TabsTrigger value="triggers" className="gap-2">
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline">My Triggers</span>
                  <span className="sm:hidden">Triggers</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">History</span>
                  <span className="sm:hidden">History</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2">
                  <SettingsIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                  <span className="sm:hidden">Settings</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create">
                <CreateTrigger />
              </TabsContent>

              <TabsContent value="triggers">
                <MyTriggers />
              </TabsContent>

              <TabsContent value="history">
                <History />
              </TabsContent>

              <TabsContent value="settings">
                <Settings />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
}