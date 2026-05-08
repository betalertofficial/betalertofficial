import { useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Zap, Target, Shield, ArrowRight, ChevronDown } from "lucide-react";
import { SEO } from "@/components/SEO";
import { TelegramLoginButton, type TelegramUser } from "@/components/auth/TelegramLoginButton";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleTelegramAuth = async (user: TelegramUser) => {
    setIsAuthenticating(true);
    
    try {
      // Send auth data to backend for verification
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

      const data = await response.json();

      toast({
        title: "Welcome! 🎯",
        description: `Logged in as ${user.first_name}`,
      });

      // Redirect to dashboard
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

  const handleGetStarted = () => {
    router.push("/dashboard");
  };

  return (
    <>
      <SEO 
        title="Bet Alert - Never Miss a Betting Opportunity"
        description="Real-time odds alerts for smart bettors. Set custom triggers and get notified instantly when your betting opportunities hit."
      />
      
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
          <div className="container mx-auto px-4 py-20 md:py-32">
            <div className="max-w-4xl mx-auto text-center space-y-8">
              <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                🔥 Live Odds Tracking
              </Badge>
              
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
                Never Miss a
                <span className="text-primary block mt-2">Betting Edge</span>
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Set custom odds alerts and get notified instantly via Telegram when your betting opportunities hit. Smart, fast, and reliable.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
                <Button 
                  size="lg" 
                  className="btn-primary text-lg px-8 py-6 h-auto group"
                  onClick={handleGetStarted}
                >
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                
                <Button 
                  size="lg" 
                  variant="outline"
                  className="text-lg px-8 py-6 h-auto"
                  onClick={() => document.getElementById("telegram-section")?.scrollIntoView({ behavior: "smooth" })}
                >
                  View Demo
                  <ChevronDown className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Telegram Login Section */}
        <section id="telegram-section" className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <Card className="glass-panel border-primary/20">
                <CardHeader className="text-center">
                  <CardTitle className="text-3xl">Login with Telegram</CardTitle>
                  <CardDescription className="text-lg">
                    One click to get started — no phone number, no SMS, no hassle
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="flex flex-col items-center justify-center gap-6">
                    {/* Telegram Login Widget */}
                    <div className="flex flex-col items-center gap-4">
                      {isAuthenticating ? (
                        <div className="flex items-center gap-3 py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                          <span className="text-muted-foreground">Authenticating...</span>
                        </div>
                      ) : (
                        <TelegramLoginButton onAuth={handleTelegramAuth} />
                      )}
                    </div>

                    {/* How it works */}
                    <div className="max-w-md space-y-4 mt-8">
                      <h3 className="font-semibold text-center mb-6">How it works</h3>
                      
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          1
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1">Click Login Button</h4>
                          <p className="text-sm text-muted-foreground">
                            Your Telegram app will open to authorize
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          2
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1">Authorize in Telegram</h4>
                          <p className="text-sm text-muted-foreground">
                            Confirm your account — takes 2 seconds
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          3
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1">Start Creating Triggers</h4>
                          <p className="text-sm text-muted-foreground">
                            You're in! Set up alerts and get notified via Telegram
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 max-w-md mt-6">
                      <p className="text-sm text-muted-foreground text-center">
                        💡 <strong>Tip:</strong> Make sure you have Telegram installed on your device for the smoothest experience
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Why Choose Bet Alert?</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Built for serious bettors who need speed, reliability, and precision
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              <Card className="glass-panel hover:shadow-xl transition-all duration-300 border-primary/20">
                <CardHeader>
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Bell className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Instant Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Get notified via Telegram the moment odds hit your target. No delays, no missed opportunities.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="glass-panel hover:shadow-xl transition-all duration-300 border-primary/20">
                <CardHeader>
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Custom Triggers</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Set precise odds thresholds for any sport, team, or betting market. You control the strategy.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="glass-panel hover:shadow-xl transition-all duration-300 border-primary/20">
                <CardHeader>
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Real-Time Odds</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Live odds from top sportsbooks, updated every minute. Always have the edge.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="glass-panel hover:shadow-xl transition-all duration-300 border-primary/20">
                <CardHeader>
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>No Phone Required</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Telegram-first authentication. No SMS, no carrier restrictions, no hassle.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary/5">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <h2 className="text-4xl font-bold">Ready to Start Winning?</h2>
              <p className="text-xl text-muted-foreground">
                Join smart bettors already using Bet Alert to stay ahead of the game.
              </p>
              <div className="flex justify-center">
                <TelegramLoginButton onAuth={handleTelegramAuth} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}