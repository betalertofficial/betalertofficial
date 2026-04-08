import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, Settings, CheckCircle2, Sliders, Radio, Wallet, Mail, Globe } from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-xl font-bold tracking-tight">
                BETALERT
              </Link>
              <nav className="hidden md:flex items-center gap-6">
                <Link href="#features" className="text-sm text-gray-600 hover:text-gray-900">
                  Features
                </Link>
                <Link href="#pricing" className="text-sm text-gray-600 hover:text-gray-900">
                  Pricing
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" className="text-sm">
                Login
              </Button>
              <Button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-6">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
              We watch the games when you can't.
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              Set highly specific triggers and get an SMS the moment it hits.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-8 py-6 text-lg">
                Create My Alert
              </Button>
            </div>
          </div>

          {/* Trigger Card Mockup */}
          <div className="relative">
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
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Condition Matched!</span>
                </div>
              </div>
            </Card>

            {/* SMS Notification Mockup with Pulse Animation */}
            <div className="absolute -bottom-8 -right-8 bg-gray-900 text-white rounded-2xl p-4 shadow-2xl max-w-xs animate-pulse-float">
              <div className="flex items-start gap-3">
                <div className="bg-green-500 rounded-lg p-2 flex-shrink-0">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1">BET ALERT - NOW</div>
                  <div className="text-sm">
                    Lakers are at <span className="font-bold">+350</span> with 8 min left in the 3rd Quarter. Score is 85-74.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Always finding yourself hammering the comeback when a favored team gives up an early lead?
          </h2>
          <p className="text-lg text-gray-600">
            Let us monitor those situations and shoot you a text on any game or team you want so you don't have to obsessively check your phone.
          </p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="container mx-auto px-4 py-20 mb-20">
        <div className="bg-gradient-to-br from-gray-100 to-gray-50 rounded-3xl p-16 text-center max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-8">
            Just Set it and forget it.
          </h2>
          <Button className="bg-green-500 hover:bg-green-600 text-white rounded-full px-10 py-7 text-xl font-semibold shadow-lg hover:shadow-xl transition-all">
            Create Your First Trigger
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div>
              <div className="text-xl font-bold mb-4">BETALERT</div>
              <p className="text-sm text-gray-500">
                © 2026 Bet Alert. Elite Sports Analytics.
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <Link href="#" className="text-gray-600 hover:text-gray-900 uppercase tracking-wide">
                Privacy Policy
              </Link>
              <Link href="#" className="text-gray-600 hover:text-gray-900 uppercase tracking-wide">
                Terms of Service
              </Link>
              <Link href="#" className="text-gray-600 hover:text-gray-900 uppercase tracking-wide">
                Responsible Gaming
              </Link>
              <Link href="#" className="text-gray-600 hover:text-gray-900 uppercase tracking-wide">
                Contact
              </Link>
            </div>
            <div className="flex gap-4">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Globe className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Mail className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}