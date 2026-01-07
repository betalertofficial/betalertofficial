import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { profileService } from "@/services/profileService";
import { triggerService } from "@/services/triggerService";
import { LogOut, Save } from "lucide-react";

export function Settings() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const loadTriggerCount = async () => {
      if (profile?.id) {
        try {
          const triggers = await triggerService.getUserTriggers(profile.id);
          const active = triggers.filter(t => t.trigger?.status === "active").length;
          setActiveCount(active);
        } catch (error) {
          console.error("Error loading trigger count:", error);
        }
      }
    };
    loadTriggerCount();
  }, [profile?.id]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    setMessage("");

    try {
      await profileService.updateProfile(profile.id, { name });
      await refreshProfile();
      setMessage("Profile updated successfully!");
    } catch (error: any) {
      setMessage(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your account details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>

              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  type="text"
                  value={profile?.phone_e164 || ""}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Phone number cannot be changed</p>
              </div>

              {message && (
                <div className={`px-4 py-3 rounded-lg text-sm ${
                  message.includes("success") 
                    ? "bg-primary/10 border border-primary/20 text-primary"
                    : "bg-destructive/10 border border-destructive/20 text-destructive"
                }`}>
                  {message}
                </div>
              )}

              <Button type="submit" className="w-full btn-primary" disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Manage your subscription and limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Current Tier</p>
                <p className="text-lg font-bold capitalize">{profile?.subscription_tier || "Free"}</p>
              </div>
              <Badge className="bg-primary text-primary-foreground">
                Active
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Triggers Remaining</p>
                <p className="text-lg font-bold">
                  {profile?.trigger_limit ? Math.max(0, profile.trigger_limit - activeCount) : 0}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-4">
                Upgrade to premium for unlimited triggers, priority alerts, and advanced features.
              </p>
              <Button variant="outline" className="w-full" disabled>
                Upgrade Plan (Coming Soon)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-destructive/20">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible account actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 border-destructive/20"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
