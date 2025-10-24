
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/");
      }
    };
    checkAuth();
  }, [router]);

  const handleSuperAdminLogin = async () => {
    setError("");
    setLoading(true);

    try {
      // Call the dev-admin-login API to create a real Supabase session
      const response = await fetch("/api/dev-admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create admin session");
      }

      const { access_token, refresh_token } = await response.json();

      // Set the session in Supabase client
      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token
      });

      if (sessionError) throw sessionError;

      // Redirect to main dashboard after successful login
      router.push("/");
    } catch (err: any) {
      console.error("Super admin login error:", err);
      setError(err.message || "Failed to sign in as super admin");
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
          <CardTitle className="text-3xl font-bold">Super Admin Login</CardTitle>
          <CardDescription className="text-muted-foreground mt-2">
            Development access - no OTP required
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-card/50 border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Super Admin Credentials:</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><strong>Phone:</strong> +15555550001</p>
                <p><strong>Email:</strong> admin@betalert.dev</p>
                <p><strong>Role:</strong> super_admin</p>
                <p><strong>Trigger Limit:</strong> 999</p>
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
              onClick={handleSuperAdminLogin}
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
                  Sign in as Super Admin
                </>
              )}
            </Button>

            <div className="bg-accent/10 border border-accent/20 text-accent px-4 py-3 rounded-lg text-xs">
              <strong>⚠️ Development Only:</strong> This creates a real authenticated session with full system access. 
              The super admin can create triggers, manage users, and control all system functions.
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push("/")}
            >
              Back to Phone Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
