import Link from "next/link";
import { SEO } from "@/components/SEO";
import { LegalFooter } from "@/components/legal/LegalFooter";

const RESOURCES = [
  { name: "1-800-GAMBLER (National Problem Gambling Helpline)", detail: "Call or text 1-800-426-2537, 24/7, free and confidential.", href: "tel:18004264537" },
  { name: "National Council on Problem Gambling", detail: "Chat, local help and self-assessment tools.", href: "https://www.ncpgambling.org/help-treatment/" },
  { name: "Gamblers Anonymous", detail: "Peer support meetings in person and online.", href: "https://www.gamblersanonymous.org/" },
  { name: "Gam-Anon", detail: "Support for family and friends of people who gamble.", href: "https://www.gam-anon.org/" },
];

export default function ResponsibleGamblingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO title="Responsible Gambling - Hammer" description="Resources and tips for gambling responsibly." />
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto max-w-3xl px-4 h-14 flex items-center">
          <Link href="/" className="font-bold text-lg tracking-tight">Hammer</Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Responsible Gambling</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            Hammer is an alert tool, not a sportsbook. We never take bets. But because our alerts are about betting
            odds, we want everyone using Hammer to stay in control. You must be 21+ to use Hammer.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Keep it fun</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
            <li>Only bet what you can afford to lose. Treat it as entertainment, not income.</li>
            <li>Set a budget and time limit before you start, and stick to them.</li>
            <li>Never chase losses or bet to win back money.</li>
            <li>Don&apos;t bet when you&apos;re upset, stressed or drinking.</li>
            <li>Use the deposit limits, time-outs and self-exclusion tools your sportsbook offers.</li>
            <li>An alert or trend is information, not a reason you have to bet. Skipping a bet is always fine.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Warning signs</h2>
          <p className="text-sm leading-relaxed text-gray-700">
            Betting more than you planned, hiding it from people close to you, borrowing to bet, or feeling anxious when
            you&apos;re not betting can all be signs it&apos;s time to take a break or talk to someone.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Get help</h2>
          <div className="grid gap-3">
            {RESOURCES.map((r) => (
              <a
                key={r.name}
                href={r.href}
                target={r.href.startsWith("http") ? "_blank" : undefined}
                rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50"
              >
                <div className="text-sm font-semibold text-gray-900">{r.name}</div>
                <div className="text-sm text-gray-600">{r.detail}</div>
              </a>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Taking a break from Hammer</h2>
          <p className="text-sm leading-relaxed text-gray-700">
            You can pause or delete any trigger from your dashboard at any time to stop alerts. To stop all messages,
            delete your triggers or block the Hammer bot in Telegram.
          </p>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
