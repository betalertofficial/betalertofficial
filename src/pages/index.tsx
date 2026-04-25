import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, Settings, CheckCircle2, Sliders, Radio, Wallet, Mail, Globe } from "lucide-react";
import Link from "next/link";
import { SEO } from "@/components/SEO";

export default function LandingPage() {
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
            <div className="flex flex-wrap gap-4">
              <Link href="/dashboard">
                <Button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-6 py-5 md:px-8 md:py-6 text-base md:text-lg">
                  Create My Alert
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement Section */}
      <section className="bg-white py-20">
        <div className="max-w-4xl mx-auto text-center">
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
    </div>);

}