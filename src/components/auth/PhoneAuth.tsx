import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { profileService } from "@/services/profileService";
import { useToast } from "@/hooks/use-toast";

interface PhoneAuthProps {
  onSuccess?: () => void;
}

export function PhoneAuth({ onSuccess }: PhoneAuthProps) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

      // Get current user to check if they're anonymous
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (currentUser?.is_anonymous) {
        // For anonymous users, use updateUser to link the phone
        const { error } = await supabase.auth.updateUser({
          phone: phoneE164,
        });

        if (error) throw error;
      } else {
        // For non-anonymous users, use signInWithOtp
        const { error } = await supabase.auth.signInWithOtp({
          phone: phoneE164,
        });

        if (error) throw error;
      }

      setStep("otp");
      toast({
        title: "Code Sent! 📱",
        description: "Check your phone for the verification code",
      });
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

      // Get current user to check if they're anonymous
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (currentUser?.is_anonymous) {
        // For anonymous users, verify the OTP to link the phone
        const { data, error } = await supabase.auth.verifyOtp({
          phone: phoneE164,
          token: otp,
          type: "phone_change",
        });

        if (error) throw error;

        if (data.user) {
          // Update the existing profile with the phone number
          const existingProfile = await profileService.getProfile(data.user.id);
          
          if (existingProfile) {
            await profileService.updateProfile(data.user.id, {
              phone_e164: phoneE164,
              country_code: "US"
            });
          } else {
            await profileService.createProfile({
              id: data.user.id,
              phone_e164: phoneE164,
              country_code: "US",
              role: "user",
              subscription_tier: "free",
              trigger_limit: 3,
              name: ""
            });
          }

          toast({
            title: "Success! 🎉",
            description: "Your phone number has been verified",
          });

          if (onSuccess) {
            onSuccess();
          }
        }
      } else {
        // For non-anonymous users, use standard SMS verification
        const { data, error } = await supabase.auth.verifyOtp({
          phone: phoneE164,
          token: otp,
          type: "sms",
        });

        if (error) throw error;

        if (data.user) {
          const existingProfile = await profileService.getProfile(data.user.id);
          
          if (!existingProfile) {
            await profileService.createProfile({
              id: data.user.id,
              phone_e164: phoneE164,
              country_code: "US",
              role: "user",
              subscription_tier: "free",
              trigger_limit: 3,
              name: ""
            });
          }

          toast({
            title: "Success! 🎉",
            description: "Your phone number has been verified",
          });

          if (onSuccess) {
            onSuccess();
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full glass-panel border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-foreground">
          Verify Your Phone
        </CardTitle>
        <CardDescription className="text-muted-foreground mt-2">
          {step === "phone" ? "Enter your phone number to receive alerts" : "Enter the verification code"}
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
              {loading ? "Verifying..." : "Verify & Continue"}
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
          By verifying your phone, you agree to receive SMS alerts when your triggers are hit.
        </p>
      </CardContent>
    </Card>
  );
}