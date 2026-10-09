import Link from "next/link";
import { SEO } from "@/components/SEO";
import { LegalFooter } from "@/components/legal/LegalFooter";

const UPDATED = "October 9, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO title="Terms & Disclaimer - Hammer" description="Hammer is an informational odds-alert tool, not a sportsbook." />
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto max-w-3xl px-4 h-14 flex items-center">
          <Link href="/" className="font-bold text-lg tracking-tight">Hammer</Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Terms of Use &amp; Disclaimer</h1>
          <p className="mt-1 text-sm text-gray-500">Last updated {UPDATED}</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <strong>The short version:</strong> Hammer is not a betting app. We never accept or place bets and never handle
          your money. We send alerts about publicly available odds. Any bet you make is your decision, with a sportsbook
          of your choosing, and Hammer is not responsible for it.
        </div>

        <Section title="1. What Hammer is (and isn't)">
          <p>
            Hammer (&quot;Hammer&quot;, &quot;we&quot;, &quot;us&quot;) is an informational tool that monitors publicly available sports odds,
            scores and historical trends and sends you notifications based on conditions you set.
          </p>
          <p>
            Hammer is <strong>not</strong> a sportsbook, casino, bookmaker, betting exchange, or gambling operator. We do not
            accept, place, broker, hold or settle wagers of any kind, and no money is wagered through Hammer.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 21 years old (or the minimum legal gambling age where you live, if higher) to use Hammer.
            By using Hammer you confirm that you meet this requirement and that using information about sports betting is
            legal where you are.
          </p>
        </Section>

        <Section title="3. Your bets are your responsibility">
          <p>
            Any decision to place a bet is made solely by you, with a third-party operator, at your own risk. Hammer does
            not recommend, guarantee or endorse any wager, and alerts, trends, percentages and odds movements are not
            predictions or advice of any kind (betting, financial, legal or otherwise). Past results do not guarantee
            future outcomes.
          </p>
          <p>
            You are solely responsible for complying with the laws of your jurisdiction and the terms of any sportsbook
            you use.
          </p>
        </Section>

        <Section title="4. No liability for bets or losses">
          <p>
            To the fullest extent permitted by law, Hammer and its owners, operators and affiliates are not liable for any
            wager you place or decide not to place, or for any losses, missed opportunities, or damages of any kind
            (direct, indirect, incidental or consequential) arising from your use of Hammer or reliance on any alert or
            information it provides.
          </p>
        </Section>

        <Section title="5. Accuracy and availability">
          <p>
            Odds, scores, schedules and statistics come from third-party sources and may be delayed, incomplete or wrong.
            Alerts may arrive late, more than once, or not at all (for example, due to provider outages, Telegram delivery
            issues or game-status changes). Always confirm odds and terms directly with your sportsbook before acting.
            Hammer is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind.
          </p>
        </Section>

        <Section title="6. Third-party links">
          <p>
            Hammer may link to sportsbooks and other third-party sites. We don&apos;t control them and aren&apos;t responsible for
            their content, offers, availability in your state, or conduct. Some links may be affiliate links, meaning
            Hammer may earn a commission if you sign up, at no extra cost to you. This never changes the odds or alerts we
            show.
          </p>
        </Section>

        <Section title="7. Your account">
          <p>
            You sign in with Telegram. Keep your Telegram account secure; you&apos;re responsible for activity under it. We
            may suspend accounts that misuse the service.
          </p>
        </Section>

        <Section title="8. Changes">
          <p>We may update these terms. Continued use of Hammer after changes means you accept the updated terms.</p>
        </Section>

        <Section title="Need help with gambling?">
          <p>
            If gambling is causing problems for you or someone you know, call or text{" "}
            <a href="tel:18004264537" className="underline">1-800-GAMBLER</a>. See our{" "}
            <Link href="/responsible-gambling" className="underline">Responsible Gambling</Link> page for more resources.
          </p>
        </Section>
      </main>

      <LegalFooter />
    </div>
  );
}
