import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { adminService, type AdminStats } from "@/services/adminService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Loader2, 
  Users, 
  Activity, 
  Bell, 
  Settings as SettingsIcon,
  ArrowLeft,
  Database,
  TrendingUp,
  PlayCircle,
  Edit,
  Calendar,
  RefreshCw,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { PollingControlModal } from "@/components/admin/PollingControlModal";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(30);
  const [isEditingInterval, setIsEditingInterval] = useState(false);
  const [tempInterval, setTempInterval] = useState("30");
  const [isManualPolling, setIsManualPolling] = useState(false);
  const [showPollingModal, setShowPollingModal] = useState(false);
  const [isMappingTeams, setIsMappingTeams] = useState(false);
  const [syncingSchedules, setSyncingSchedules] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [trackedLeagues, setTrackedLeagues] = useState<any[]>([]);
  const [eventSchedules, setEventSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setCheckingAdmin(false);
        return;
      }

      try {
        const adminCheck = await adminService.checkIsAdmin(user.id);
        setIsAdmin(adminCheck);
        
        if (adminCheck) {
          loadAdminData();
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    };

    checkAdmin();
  }, [user]);

  // Load tracked leagues and event schedules
  useEffect(() => {
    loadTrackedLeagues();
    loadEventSchedules();
  }, []);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Restart interval if polling is enabled and interval changes
  useEffect(() => {
    if (pollingEnabled && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = setInterval(async () => {
        try {
          await handleManualPoll();
        } catch (error) {
          console.error("Automated poll error:", error);
        }
      }, pollingInterval * 1000);
    }
  }, [pollingInterval]);

  const loadAdminData = async () => {
    try {
      const [statsData, settingsData] = await Promise.all([
        adminService.getAdminStats(),
        adminService.getAdminSettings()
      ]);
      
      setStats(statsData);
      setPollingEnabled(settingsData.oddsPollingEnabled);
      setPollingInterval(settingsData.pollingIntervalSeconds);
      setTempInterval(String(settingsData.pollingIntervalSeconds));
    } catch (error) {
      console.error("Error loading admin data:", error);
    }
  };

  async function loadTrackedLeagues() {
    try {
      const { data, error } = await supabase
        .from("tracked_leagues")
        .select("*")
        .order("league_name");

      if (error) throw error;
      setTrackedLeagues(data || []);
    } catch (error) {
      console.error("Error loading leagues:", error);
    }
  }

  async function loadEventSchedules() {
    setLoadingSchedules(true);
    try {
      const { data, error } = await supabase
        .from("event_schedules")
        .select("*")
        .order("commence_time", { ascending: true })
        .limit(20);

      if (error) throw error;
      setEventSchedules(data || []);
    } catch (error) {
      console.error("Error loading schedules:", error);
    } finally {
      setLoadingSchedules(false);
    }
  }

  async function handleSyncSchedules() {
    setSyncingSchedules(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/admin/sync-schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to sync schedules");
      }

      setSyncResult(result);
      toast({
        title: "Success",
        description: `Synced ${result.total_events_synced} events across ${result.leagues_synced} leagues`,
      });

      await loadEventSchedules();
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sync schedules",
        variant: "destructive",
      });
    } finally {
      setSyncingSchedules(false);
    }
  }

  async function toggleLeague(leagueKey: string, currentEnabled: boolean) {
    try {
      const { error } = await supabase
        .from("tracked_leagues")
        .update({ enabled: !currentEnabled })
        .eq("league_key", leagueKey);

      if (error) throw error;

      toast({
        title: "Success",
        description: `League ${!currentEnabled ? "enabled" : "disabled"}`,
      });

      await loadTrackedLeagues();
    } catch (error) {
      console.error("Toggle error:", error);
      toast({
        title: "Error",
        description: "Failed to toggle league",
        variant: "destructive",
      });
    }
  }

  const handlePollingToggle = async (enabled: boolean) => {
    try {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      const response = await fetch("/api/admin/polling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polling_enabled: enabled }),
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error("Failed to update polling settings");
      }

      setPollingEnabled(enabled);

      if (enabled) {
        await handleManualPoll();
        pollingIntervalRef.current = setInterval(async () => {
          try {
            await handleManualPoll();
          } catch (error) {
            console.error("Automated poll error:", error);
          }
        }, pollingInterval * 1000);

        toast({
          title: "Polling Started",
          description: `Automated polling will run every ${pollingInterval} seconds`,
        });
      } else {
        toast({
          title: "Polling Stopped",
          description: "Automated polling has been disabled",
        });
      }
    } catch (error) {
      console.error("Error toggling polling:", error);
      toast({
        title: "Error",
        description: "Failed to update polling settings",
        variant: "destructive"
      });
    }
  };

  const handleUpdateInterval = async () => {
    const newInterval = parseInt(tempInterval);
    
    if (isNaN(newInterval) || newInterval < 10) {
      toast({
        title: "Invalid Interval",
        description: "Polling interval must be at least 10 seconds",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch("/api/admin/polling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          polling_enabled: pollingEnabled,
          polling_interval_seconds: newInterval 
        }),
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error("Failed to update polling interval");
      }

      setPollingInterval(newInterval);
      setIsEditingInterval(false);

      if (pollingEnabled) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }

        pollingIntervalRef.current = setInterval(async () => {
          try {
            await handleManualPoll();
          } catch (error) {
            console.error("Automated poll error:", error);
          }
        }, newInterval * 1000);
      }

      toast({
        title: "Interval Updated",
        description: `Polling interval set to ${newInterval} seconds`,
      });
    } catch (error) {
      console.error("Error updating interval:", error);
      toast({
        title: "Error",
        description: "Failed to update polling interval",
        variant: "destructive"
      });
    }
  };

  const handleManualPoll = async () => {
    if (isManualPolling) {
      console.log("Poll already in progress, skipping");
      return;
    }

    console.log("Starting manual poll...");
    setIsManualPolling(true);
    
    try {
      const response = await fetch("/api/admin/manual-poll-v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ dryRun: false }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      console.log("=== MANUAL POLL RESULT ===");
      console.log("Evaluation Run ID:", result.evaluation_run_id);
      console.log("Triggers Checked:", result.triggers_checked);
      console.log("Live Events:", result.live_events_count);
      console.log("Active Sports:", result.active_sports);
      console.log("Matches Found:", result.matches_found);
      console.log("Alerts Created:", result.alerts_created);
      console.log("Webhooks Sent:", result.webhooks_sent);
      console.log("Duration (ms):", result.duration_ms);
      console.log("Full result:", result);
      
      // Build detailed description
      let description = `Checked ${result.triggers_checked} triggers`;
      
      if (result.live_events_count !== undefined && result.live_events_count > 0) {
        description += ` across ${result.live_events_count} live event${result.live_events_count === 1 ? '' : 's'}`;
        
        if (result.active_sports && result.active_sports.length > 0) {
          const sportNames = result.active_sports
            .map((s: string) => s.replace(/_/g, " ").toUpperCase())
            .join(", ");
          description += ` (${sportNames})`;
        }
        
        description += `. Found ${result.matches_found} match${result.matches_found === 1 ? '' : 'es'}, sent ${result.webhooks_sent} alert${result.webhooks_sent === 1 ? '' : 's'}.`;
      } else if (result.skipped_reason) {
        description = result.skipped_reason + ". No live games found in event schedules.";
      } else {
        description += `. Found ${result.matches_found} matches, sent ${result.webhooks_sent} alerts.`;
      }
      
      toast({
        title: "Manual Poll Complete",
        description: description + " Check browser console (F12) for details.",
        variant: result.matches_found > 0 ? "default" : "default",
      });
      
    } catch (error: any) {
      console.error("Error running manual poll:", error);
      
      const errorMessage = error.message || "Unknown error occurred";

      toast({
        title: "Manual Poll Failed",
        description: (
          <div className="mt-2 w-[340px] md:w-[500px] overflow-auto">
            <p className="text-sm font-medium mb-2">Error:</p>
            <pre className="rounded-md bg-slate-950 p-4">
              <code className="text-white text-xs">{errorMessage}</code>
            </pre>
          </div>
        ),
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      console.log("Resetting manual poll loading state");
      setIsManualPolling(false);
      
      loadAdminData().catch((error) => {
        console.error("Error reloading admin data:", error);
      });
    }
  };

  const handleMapNBATeams = async () => {
    setIsMappingTeams(true);
    try {
      const response = await fetch("/api/admin/map-nba-teams", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to map NBA teams");
      }

      toast({
        title: "NBA Teams Mapped Successfully",
        description: `Mapped ${data.mapped} teams. ${data.unmapped > 0 ? `${data.unmapped} teams could not be automatically mapped.` : ""}`,
        duration: 5000,
      });

      if (data.unmappedTeams && data.unmappedTeams.length > 0) {
        console.log("Unmapped teams:", data.unmappedTeams);
      }
    } catch (error) {
      toast({
        title: "Mapping Failed",
        description: error instanceof Error ? error.message : "Failed to map NBA teams",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsMappingTeams(false);
    }
  };

  if (loading || checkingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    router.push("/");
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="glass-panel max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/")} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border glass-panel sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <SettingsIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">Bet Alert System Management</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              User Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Total Users</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {stats?.totalUsers || 0}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Active Triggers</p>
                  <p className="text-3xl font-bold text-primary mt-1">
                    {stats?.activeTriggers || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    of {stats?.totalTriggers || 0} total
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Alerts Today</p>
                  <p className="text-3xl font-bold text-accent mt-1">
                    {stats?.alertsSentToday || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    of {stats?.totalAlerts || 0} total
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Bell className="h-6 w-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Odds Polling</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={pollingEnabled}
                      onCheckedChange={handlePollingToggle}
                      disabled={isManualPolling}
                    />
                    <Badge className={pollingEnabled ? "bg-primary" : "bg-muted"}>
                      {pollingEnabled ? "ON" : "OFF"}
                    </Badge>
                  </div>
                </div>
                <div className="h-12 w-12 rounded-lg bg-card flex items-center justify-center">
                  <Database className="h-6 w-6 text-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="schedules" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4">
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="triggers">Triggers</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="schedules">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Event Schedule Management
                </CardTitle>
                <CardDescription>
                  Configure tracked leagues and sync upcoming game schedules
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Sync Schedules Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Sync Event Schedules</h3>
                      <p className="text-sm text-muted-foreground">
                        Fetch upcoming games for enabled leagues (next 7-14 days)
                      </p>
                    </div>
                    <Button
                      onClick={handleSyncSchedules}
                      disabled={syncingSchedules}
                    >
                      {syncingSchedules ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync Now
                        </>
                      )}
                    </Button>
                  </div>

                  {syncResult && (
                    <Alert>
                      <Database className="h-4 w-4" />
                      <AlertTitle>Sync Complete</AlertTitle>
                      <AlertDescription>
                        <div className="mt-2 space-y-1 text-sm">
                          <p>Total events synced: {syncResult.total_events_synced}</p>
                          <p>Leagues processed: {syncResult.leagues_synced}</p>
                          {syncResult.details && (
                            <div className="mt-2">
                              {Object.entries(syncResult.details).map(([league, count]: [string, any]) => (
                                <p key={league}>
                                  {league}: {count} events
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Tracked Leagues Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Tracked Leagues</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {trackedLeagues.map((league) => (
                      <Card key={league.league_key}>
                        <CardContent className="flex items-center justify-between p-4">
                          <div>
                            <p className="font-medium">{league.league_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {league.league_key}
                            </p>
                          </div>
                          <Button
                            variant={league.enabled ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleLeague(league.league_key, league.enabled)}
                          >
                            {league.enabled ? (
                              <>
                                <ToggleRight className="mr-2 h-4 w-4" />
                                Enabled
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="mr-2 h-4 w-4" />
                                Disabled
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Upcoming Events Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Upcoming Events</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadEventSchedules}
                      disabled={loadingSchedules}
                    >
                      {loadingSchedules ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {eventSchedules.length === 0 ? (
                    <Alert>
                      <AlertTitle>No events scheduled</AlertTitle>
                      <AlertDescription>
                        Click "Sync Now" to fetch upcoming game schedules
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>League</TableHead>
                            <TableHead>Matchup</TableHead>
                            <TableHead>Start Time</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventSchedules.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="font-medium">
                                {event.league_key.replace("_", " ").toUpperCase()}
                              </TableCell>
                              <TableCell>
                                {event.away_team} @ {event.home_team}
                              </TableCell>
                              <TableCell>
                                {new Date(event.commence_time).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    event.status === "live"
                                      ? "default"
                                      : event.status === "completed"
                                      ? "secondary"
                                      : "outline"
                                  }
                                >
                                  {event.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview">
            <div className="grid gap-6">
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                  <CardDescription>Real-time monitoring and controls</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div>
                      <Label htmlFor="polling-switch" className="text-base font-semibold">
                        Odds Polling
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {pollingEnabled 
                          ? `API calls running every ${pollingInterval} seconds` 
                          : "Polling suspended - no API calls"}
                      </p>
                    </div>
                    <Switch
                      id="polling-switch"
                      checked={pollingEnabled}
                      onCheckedChange={handlePollingToggle}
                      disabled={isManualPolling}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Polling Interval</p>
                      {isEditingInterval ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={tempInterval}
                            onChange={(e) => setTempInterval(e.target.value)}
                            className="w-20 px-2 py-1 rounded border bg-background text-lg font-bold"
                            min="10"
                          />
                          <span className="text-sm">sec</span>
                          <Button size="sm" onClick={handleUpdateInterval}>Save</Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setIsEditingInterval(false);
                              setTempInterval(String(pollingInterval));
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold">{pollingInterval} sec</p>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => setIsEditingInterval(true)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Max API Calls/Hour</p>
                      <p className="text-2xl font-bold">120</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Vendor</p>
                      <p className="text-lg font-bold">The Odds API</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Common administrative tasks</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button 
                    variant="outline" 
                    className="h-auto flex-col items-start p-4"
                    onClick={handleManualPoll}
                    disabled={isManualPolling}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isManualPolling ? (
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      ) : (
                        <PlayCircle className="h-5 w-5 text-primary" />
                      )}
                      <span className="font-semibold">
                        {isManualPolling ? "Running Poll..." : "Run Manual Poll"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground text-left">
                      Manually check all active triggers now
                    </p>
                  </Button>

                  <Button variant="outline" className="h-auto flex-col items-start p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <span className="font-semibold">View Analytics</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-left">
                      Detailed system performance metrics
                    </p>
                  </Button>
                </CardContent>
              </Card>

              <div className="glass-panel p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">NBA Team Mapping</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Map Odds API team names to canonical teams
                    </p>
                  </div>
                  <Button
                    onClick={handleMapNBATeams}
                    disabled={isMappingTeams}
                    variant="outline"
                  >
                    {isMappingTeams ? "Mapping..." : "Map NBA Teams"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="triggers">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Trigger Management</CardTitle>
                <CardDescription>Monitor and manage all triggers</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Trigger management interface coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>System Logs</CardTitle>
                <CardDescription>API calls, evaluations, and errors</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Log viewer coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-border mt-16 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Bet Alert Admin Dashboard • {profile?.name} ({profile?.role})
          </p>
        </div>
      </footer>

      <PollingControlModal isOpen={showPollingModal} onOpenChange={setShowPollingModal} />
    </div>
  );
}