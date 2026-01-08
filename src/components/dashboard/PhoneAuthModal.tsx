import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Phone } from "lucide-react";

interface PhoneAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PhoneAuthModal({ open, onOpenChange, onSuccess }: PhoneAuthModalProps) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);

  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length === 0) return "";
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast({
        title: "Code Sent",
        description: `Verification code sent to ${phone}`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to send verification code",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const cleaned = phone.replace(/\D/g, "");
      const phoneE164 = `+1${cleaned}`;

      // Get current user session
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const isAnonymous = currentUser?.is_anonymous;

      // Verify OTP
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token: otp,
        type: "sms",
      });

      if (error) throw error;

      // If the user was anonymous, we need to link the accounts
      if (isAnonymous && currentUser) {
        // Update the profile with phone number
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            phone_e164: phoneE164,
            country_code: "US",
            name: ""
          })
          .eq("id", currentUser.id);

        if (updateError) throw updateError;
      }

      toast({
        title: "Success!",
        description: "Your account has been verified. You can now create triggers and receive SMS alerts.",
      });

      // Reset form state
      setPhone("");
      setOtp("");
      setStep("phone");
      
      // Close modal and trigger success callback
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Invalid verification code",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep("phone");
    setOtp("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#1B2229] border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Phone className="h-6 w-6 text-primary" />
            Verify Your Phone Number
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === "phone" 
              ? "Enter your phone number to receive SMS alerts when your triggers are matched."
              : `Enter the 6-digit code sent to ${phone}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === "phone" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium text-muted-foreground">
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  maxLength={14}
                  required
                  className="text-lg bg-[#242B33] border-border"
                />
                <p className="text-xs text-muted-foreground">
                  US numbers only. Standard SMS rates may apply.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full btn-primary h-12 text-base"
                disabled={loading || phone.replace(/\D/g, "").length !== 10}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp" className="text-sm font-medium text-muted-foreground">
                  Verification Code
                </Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  required
                  className="text-lg text-center tracking-widest bg-[#242B33] border-border"
                />
              </div>

              <Button
                type="submit"
                className="w-full btn-primary h-12 text-base"
                disabled={loading || otp.length !== 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Continue"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBack}
                disabled={loading}
              >
                Change Phone Number
              </Button>
            </form>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          By continuing, you agree to receive SMS notifications for your betting alerts.
        </p>
      </DialogContent>
    </Dialog>
  );
}