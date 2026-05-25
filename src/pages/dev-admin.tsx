import { useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2 } from "lucide-react";

export default function DevAdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAdminLogin = async () => {
    setError("");
    setLoading(true);

    try {
      console.log("[Dev Admin] Starting login...");
      
      const response = await fetch("/api/dev-admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
      });

      console.log("[Dev Admin] Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create admin session");
      }

      const { success, profile } = await response.json();
      console.log("[Dev Admin] Login response:", { success, profile });

      if (success && profile) {
        // Store profile in localStorage for AuthContext to read
        localStorage.setItem("dev_admin_profile", JSON.stringify(profile));
        console.log("[Dev Admin] Profile stored in localStorage");
        
        // Force reload to pick up the new profile
        window.location.href = "/admin";
      } else {
        throw new Error("Login failed - no profile returned");
      }
    } catch (err: any) {
      console.error("[Dev Admin] Login error:", err);
      setError(err.message || "Failed to sign in as admin");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md glass-panel border-primary/30">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Dev Admin Access</CardTitle>
          <CardDescription className="text-muted-foreground mt-2">
            Development-only admin login (localStorage-based)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-card/50 border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">What happens:</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>✓ Creates admin profile (telegram_chat_id: 999999999)</p>
                <p>✓ Stores profile in localStorage (iframe-compatible)</p>
                <p>✓ Grants super_admin role</p>
                <p>✓ Redirects to /admin dashboard</p>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button
              type="button"
              className="w-full btn-primary h-12"
              onClick={handleAdminLogin}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Grant Admin Access
                </>
              )}
            </Button>

            <div className="bg-accent/10 border border-accent/20 text-accent px-4 py-3 rounded-lg text-xs">
              <strong>⚠️ Dev Only:</strong> Uses localStorage instead of cookies for iframe compatibility. Only works in development mode.
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push("/")}
            >
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}