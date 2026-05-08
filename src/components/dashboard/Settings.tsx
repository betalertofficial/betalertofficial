import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, LogOut, Check } from "lucide-react";
import { TelegramLoginButton, type TelegramUser } from "@/components/auth/TelegramLoginButton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function Settings() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [isLinking, setIsLinking] = useState(false);

  const handleTelegramLink = async (user: TelegramUser) => {
    setIsLinking(true);
    
    try {
      // Send auth data to backend for verification and linking
      const response = await fetch("/api/auth/telegram-callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(user),
      });

      if (!response.ok) {
        throw new Error("Failed to link Telegram account");
      }

      // Refresh profile to show updated telegram data
      await refreshProfile();

      toast({
        title: "Telegram Connected! 🎯",
        description: "You'll now receive alerts via Telegram",
      });
    } catch (error) {
      console.error("Telegram link error:", error);
      toast({
        title: "Connection Error",
        description: "Failed to link Telegram account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const isTelegramConnected = !!profile?.telegram_chat_id;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and notification preferences</p>
      </div>

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
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your Telegram account to receive instant alerts when your triggers hit.
                  No phone number required!
                </p>
                {isLinking ? (
                  <div className="flex items-center gap-3 py-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                    <span className="text-sm text-muted-foreground">Connecting...</span>
                  </div>
                ) : (
                  <TelegramLoginButton onAuth={handleTelegramLink} buttonSize="medium" />
                )}
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
