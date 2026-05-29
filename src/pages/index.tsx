import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, Settings } from "lucide-react";
import Link from "next/link";
import { SEO } from "@/components/SEO";
import { TelegramLoginButton } from "@/components/auth/TelegramLoginButton";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white overflow-x-hidden">
      <SEO 
        title="Hammer - Sports Betting Alerts"
        description="Set highly specific triggers and get an SMS the moment it hits."
      />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 md:py-32">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Trigger Card Mockup - Shows first on mobile */}
          <div className="relative order-1 md:order-2 pb-16 md:pb-0">
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
            <div className="absolute bottom-0 right-0 md:-bottom-8 md:-right-8 bg-gray-900 text-white rounded-2xl p-3 md:p-4 shadow-2xl w-[240px] md:max-w-xs animate-pulse-float z-10">
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
              <TelegramLoginButton
                authUrl="https://www.hammer-app.com/dashboard"
                usePic={false}
                widgetId="hero"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement Section */}
      <section className="bg-white py-20">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6" style={{ textDecoration: "none" }}>
            Always finding yourself hammering the comeback when a favored team gives up an early lead?
          </h2>
          <p className="text-base md:text-lg text-gray-600">Tell us what to look for, and we will monitor and shoot you a text on any game or team you want so you don't have to obsessively check your phone.
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
            <Card className="p-6 md:p-8 h-full bg-gray-50 border-gray-200">
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
            <Card className="p-6 md:p-8 h-full bg-gray-50 border-gray-200">
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
            <Card className="p-6 md:p-8 h-full bg-gray-50 border-gray-200">
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
              <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold">
                Or Login with Telegram
              </h2>
              <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto">
                One click to get started — no phone number, no SMS, no hassle
              </p>
            </div>

            {/* Telegram Login Button */}
            <div className="flex justify-center items-center py-8">
              <TelegramLoginButton
                authUrl="https://www.hammer-app.com/dashboard"
                usePic={false}
                widgetId="cta"
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
        <div className="bg-gradient-to-br from-gray-100 to-gray-50 rounded-3xl p-8 md:p-16 text-center max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 md:mb-8">Just set it and forget it.
          </h2>
          <Link href="/dashboard">
            <Button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-6 py-4 text-base md:px-10 md:py-7 md:text-xl font-semibold shadow-lg hover:shadow-xl transition-all">
              Create Your First Trigger
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}