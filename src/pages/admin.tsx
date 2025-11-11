import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { adminService, type AdminStats } from "@/services/adminService";
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
  PlayCircle
} from "lucide-react";
import { PollingControlModal } from "@/components/admin/PollingControlModal";
import { useToast } from "@/hooks/use-toast";

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [updatingPolling, setUpdatingPolling] = useState(false);
  const [isPollingModalOpen, setIsPollingModalOpen] = useState(false);
  const [isManualPolling, setIsManualPolling] = useState(false);

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

  const loadAdminData = async () => {
    try {
      const [statsData, settingsData] = await Promise.all([
        adminService.getAdminStats(),
        adminService.getAdminSettings()
      ]);
      
      setStats(statsData);
      setPollingEnabled(settingsData.oddsPollingEnabled);
    } catch (error) {
      console.error("Error loading admin data:", error);
    }
  };

  const handleTogglePolling = async (enabled: boolean) => {
    setUpdatingPolling(true);
    try {
      await adminService.updateAdminSetting("odds_polling_enabled", enabled);
      setPollingEnabled(enabled);
    } catch (error) {
      console.error("Error updating polling setting:", error);
      alert("Failed to update polling setting");
    } finally {
      setUpdatingPolling(false);
    }
  };

  const handleManualPoll = async () => {
    setIsManualPolling(true);
    try {
      const result = await adminService.manualPollAndCheckTriggers();
      
      toast({
        title: "Manual Poll Complete",
        description: `Checked ${result.checked} triggers, ${result.hit} hit`,
        variant: result.hit > 0 ? "default" : "default",
      });
      
      await loadAdminData();
    } catch (error: any) {
      console.error("Error running manual poll:", error);
      toast({
        title: "Manual Poll Failed",
        description: error.message || "Failed to run manual poll",
        variant: "destructive",
      });
    } finally {
      setIsManualPolling(false);
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
                      onCheckedChange={handleTogglePolling}
                      disabled={updatingPolling}
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

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="triggers">Triggers</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

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
                          ? "API calls running every 2 minutes" 
                          : "Polling suspended - no API calls"}
                      </p>
                    </div>
                    <Switch
                      id="polling-switch"
                      checked={pollingEnabled}
                      onCheckedChange={handleTogglePolling}
                      disabled={updatingPolling}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Polling Interval</p>
                      <p className="text-2xl font-bold">2 min</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Max API Calls/Hour</p>
                      <p className="text-2xl font-bold">60</p>
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
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>View and manage user accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">User management interface coming soon...</p>
              </CardContent>
            </Card>
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

        <div className="mt-8">
          <h2 className="text-2xl font-semibold tracking-tight mb-4">System Controls</h2>
          <Card>
            <CardHeader>
              <CardTitle>API Polling</CardTitle>
              <CardDescription>
                Manually control the automated 1-minute polling of the Odds API.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsPollingModalOpen(true)}>Manage API Polling</Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t border-border mt-16 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Bet Alert Admin Dashboard • {profile?.name} ({profile?.role})
          </p>
        </div>
      </footer>

      <PollingControlModal isOpen={isPollingModalOpen} onOpenChange={setIsPollingModalOpen} />
    </div>
  );
}
