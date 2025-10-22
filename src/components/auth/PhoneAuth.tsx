import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { profileService } from "@/services/profileService";
import { Shield } from "lucide-react";

export function PhoneAuth() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length === 0) return "";
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length !== 10) {
        throw new Error("Please enter a valid 10-digit phone number");
      }

      const phoneE164 = `+1${cleaned}`;

      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneE164,
      });

      if (error) throw error;

      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const cleaned = phone.replace(/\D/g, "");
      const phoneE164 = `+1${cleaned}`;

      const { data, error } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token: otp,
        type: "sms",
      });

      if (error) throw error;

      if (data.user) {
        const existingProfile = await profileService.getProfile(data.user.id);
        
        if (!existingProfile) {
          const isAdmin = phoneE164 === "+15555550001";
          
          await profileService.createProfile({
            id: data.user.id,
            phone_e164: phoneE164,
            country_code: "US",
            role: isAdmin ? "super_admin" : "user",
            subscription_tier: isAdmin ? "enterprise" : "free",
            trigger_limit: isAdmin ? 999 : 3,
            name: isAdmin ? "Super Admin" : ""
          });
        }
      }
    } catch (err: any) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminOverride = async () => {
    setAdminLoading(true);
    setError("");

    try {
      const adminPhone = "+15555550001";
      
      // Sign in with OTP for the admin phone
      const { error: sendError } = await supabase.auth.signInWithOtp({
        phone: adminPhone,
      });

      if (sendError) {
        // If OTP fails, try to sign in directly (for development)
        console.log("OTP send failed, attempting direct sign-in");
        setError("Please use the regular sign-in flow or contact support.");
        return;
      }

      alert("A verification code has been sent to the super admin phone number. Please check and enter the code.");
      setPhone("(555) 555-0001");
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Failed to initiate super admin login");
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md glass-panel">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Bet Alert
          </CardTitle>
          <CardDescription className="text-muted-foreground mt-2">
            {step === "phone" ? "Enter your phone number to get started" : "Enter the verification code"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "phone" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  maxLength={14}
                  required
                  className="text-lg"
                />
                <p className="text-xs text-muted-foreground">US numbers only. Standard SMS rates may apply.</p>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full btn-primary"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Verification Code"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Development Only
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full border-primary/30 hover:bg-primary/10"
                onClick={handleAdminOverride}
                disabled={adminLoading || loading}
              >
                {adminLoading ? (
                  "Processing..."
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Sign in as Super Admin
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Verification Code</Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  required
                  className="text-lg text-center tracking-widest"
                />
                <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to {phone}</p>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full btn-primary"
                disabled={loading || otp.length !== 6}
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                }}
              >
                Change Phone Number
              </Button>
            </form>
          )}

          <p className="text-xs text-center text-muted-foreground mt-6">
            Please gamble responsibly. Must be 21+ and located in eligible states.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
