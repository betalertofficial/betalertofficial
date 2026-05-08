import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Settings, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SEO } from "@/components/SEO";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/router";
import { TelegramLoginButton, type TelegramUser } from "@/components/auth/TelegramLoginButton";
import { useToast } from "@/hooks/use-toast";

const countryCodes = [
  { code: "+1", country: "US", flag: "🇺🇸" },
  { code: "+1", country: "CA", flag: "🇨🇦" },
  { code: "+44", country: "GB", flag: "🇬🇧" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
];

export default function LandingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    // Detect user's country based on IP
    fetch("https://ipapi.co/json/")
      .then((res) => res.json())
      .then((data) => {
        const userCountry = countryCodes.find((c) => c.country === data.country_code);
        if (userCountry) {
          setCountryCode(userCountry.code);
        }
      })
      .catch(() => {
        // Default to US if detection fails
        setCountryCode("+1");
      });
  }, []);

  const handleGetStarted = () => {
    router.push("/dashboard");
  };

  const handleTelegramAuth = async (user: TelegramUser) => {
    setIsAuthenticating(true);
    
    try {
      const response = await fetch("/api/auth/telegram-callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(user),
      });

      if (!response.ok) {
        throw new Error("Authentication failed");
      }

      toast({
        title: "Welcome! 🎯",
        description: `Logged in as ${user.first_name}`,
      });

      setTimeout(() => {
        router.push("/dashboard");
      }, 500);
    } catch (error) {
      console.error("Telegram auth error:", error);
      toast({
        title: "Authentication Error",
        description: "Failed to authenticate with Telegram. Please try again.",
        variant: "destructive",
      });
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <SEO 
        title="Hammer - Sports Betting Alerts"
        description="Set highly specific triggers and get an SMS the moment it hits."
      />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 md:py-32">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Trigger Card Mockup - Shows first on mobile */}
          <div className="relative order-1 md:order-2">
            <Card className="p-6 shadow-xl bg-white rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg">Create Trigger</h3>
                <Settings className="h-5 w-5 text-gray-400" />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
                    Team
                  </label>
                  <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center justify-between">
                    <span className="text-gray-900">Lakers</span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
                      Bet Type
                    </label>
                    <div className="bg-gray-100 rounded-lg px-4 py-3">
                      <span className="text-gray-900">Moneyline</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
                      Odds Condition
                    </label>
                    <div className="bg-gray-100 rounded-lg px-4 py-3">
                      <span className="text-gray-900">+300 or higher</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
                    Game Context
                  </label>
                  <div className="bg-gray-100 rounded-lg px-4 py-3">
                    <span className="text-gray-900">3rd Quarter or later</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg px-4 py-3">
                  <Bell className="h-5 w-5" />
                  <span className="font-medium">Condition Matched!</span>
                </div>
              </div>
            </Card>

            {/* SMS Notification Mockup with Pulse Animation */}
            <div className="absolute -bottom-6 -right-6 md:-bottom-8 md:-right-8 bg-gray-900 text-white rounded-2xl p-3 md:p-4 shadow-2xl max-w-[280px] md:max-w-xs animate-pulse-float">
              <div className="flex items-start gap-2 md:gap-3">
                <div className="bg-green-500 rounded-lg p-1.5 md:p-2 flex-shrink-0">
                  <Bell className="h-3 w-3 md:h-4 md:w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1">BET ALERT - NOW</div>
                  <div className="text-xs md:text-sm">
                    Lakers are at <span className="font-bold">+350</span> with 8 min left in the 3rd Quarter. Score is 85-74.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Text Content - Shows second on mobile */}
          <div className="order-2 md:order-1 mt-8 md:mt-0">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-4 md:mb-6">
              We watch the games when you can't.
            </h1>
            <p className="text-base md:text-lg text-gray-600 mb-6 md:mb-8 leading-relaxed">
              Set highly specific triggers and get an SMS the moment it hits.
            </p>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 max-w-md">
                <div className="flex-1 flex items-center h-12 px-3 rounded-full border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-green-500 focus-within:border-transparent">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-[90px] h-8 border-0 bg-transparent focus:ring-0 focus:ring-offset-0 pl-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countryCodes.map((item) => (
                        <SelectItem key={`${item.code}-${item.country}`} value={item.code}>
                          {item.flag} {item.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="h-6 w-px bg-gray-300 mx-2"></div>
                  <input
                    type="tel"
                    placeholder="Enter your phone number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="flex-1 h-full bg-transparent border-0 focus:outline-none text-base"
                  />
                </div>
                <Link href="/dashboard" className="w-full sm:w-auto">
                  <Button 
                    className="bg-green-500 hover:bg-green-600 text-white rounded-full h-12 px-6 text-base whitespace-nowrap w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!consentChecked || !phoneNumber}
                  >
                    Get Started
                  </Button>
                </Link>
              </div>
              <div className="flex items-start gap-2 max-w-md">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-500 cursor-pointer"
                />
                <label htmlFor="consent" className="text-xs text-gray-500 leading-relaxed cursor-pointer">
                  I agree to receive SMS alerts from Hammer when my alerts trigger. Msg & data rates may apply. Reply STOP anytime to unsubscribe.
                </label>
              </div>
              {/* CTA Section */}
              <div className="flex justify-center items-center">
                <TelegramLoginButton 
                  authUrl="https://www.hammer-app.com/dashboard"
                  usePic={false}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement Section */}
      <section className="bg-white py-20">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6" style={{ textDecoration: "none" }}>
            Always finding yourself hammering the comeback when a favored team gives up an early lead?
          </h2>
          <p className="text-lg text-gray-600">Tell us what to look for, and we will monitor and shoot you a text on any game or team you want so you don't have to obsessively check your phone.
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Step 1 */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-green-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm">
              1
            </div>
            <Card className="p-8 h-full bg-gray-50 border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Set Parameters</h3>
              <p className="text-gray-600">
                Set specific time and target odds for your favorite teams.
              </p>
            </Card>
          </div>

          {/* Step 2 */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-green-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm">
              2
            </div>
            <Card className="p-8 h-full bg-gray-50 border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Live Monitoring</h3>
              <p className="text-gray-600">We monitor the game for you and shoot you a text when it hits.
              </p>
            </Card>
          </div>

          {/* Step 3 */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-green-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm">
              3
            </div>
            <Card className="p-8 h-full bg-gray-50 border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Secure the Win</h3>
              <p className="text-gray-600">
                Lock it in and cross your fingers.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Telegram Login Section */}
      <section className="py-20 bg-gradient-to-b from-background to-background/50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold">
                Or Login with Telegram
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                One click to get started — no phone number, no SMS, no hassle
              </p>
            </div>

            {/* Telegram Login Button */}
            <div className="flex justify-center items-center py-8">
              <TelegramLoginButton 
                authUrl="https://www.hammer-app.com/dashboard"
                usePic={false}
              />
            </div>

            {/* How it works */}
            <div className="grid md:grid-cols-3 gap-6 max-w-2xl mx-auto mt-12">
              <div className="space-y-3">
                <div className="bg-primary text-primary-foreground w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  1
                </div>
                <h3 className="font-semibold">Click Login Button</h3>
                <p className="text-sm text-muted-foreground">
                  Your Telegram app will open to authorize
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-primary text-primary-foreground w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  2
                </div>
                <h3 className="font-semibold">Authorize in Telegram</h3>
                <p className="text-sm text-muted-foreground">
                  Confirm your account — takes 2 seconds
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-primary text-primary-foreground w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  3
                </div>
                <h3 className="font-semibold">Start Creating Triggers</h3>
                <p className="text-sm text-muted-foreground">
                  You're in! Set up alerts and get notified via Telegram
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 max-w-md mx-auto mt-8">
              <p className="text-sm text-muted-foreground text-center">
                💡 <strong>Tip:</strong> Make sure you have Telegram installed on your device for the smoothest experience
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="container mx-auto px-4 py-20 mb-20">
        <div className="bg-gradient-to-br from-gray-100 to-gray-50 rounded-3xl p-16 text-center max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-8">Just set it and forget it.
          </h2>
          <Link href="/dashboard">
            <Button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-10 py-7 text-xl font-semibold shadow-lg hover:shadow-xl transition-all">
              Create Your First Trigger
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}