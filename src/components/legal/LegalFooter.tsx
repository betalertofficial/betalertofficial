import Link from "next/link";

/**
 * Site-wide legal footer. Hammer is an information/alert tool only — it is not
 * a sportsbook, takes no wagers and is not responsible for bets users place.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-gray-200 bg-white ${className}`}>
      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-3 text-xs leading-relaxed text-gray-500">
        <p>
          <strong className="text-gray-700">Hammer is not a sportsbook or betting app.</strong> We do not accept, place,
          hold or process wagers, and no money is ever bet through Hammer. Hammer only sends informational odds alerts
          and trends. Odds, scores and trends come from third parties and may be delayed or inaccurate. Nothing on
          Hammer is betting, financial or professional advice.
        </p>
        <p>
          Any bet you choose to place is your own decision, made with a third-party sportsbook, at your own risk.
          Hammer is not liable for any wager, loss or outcome. You must be 21 or older (or the legal age where you live)
          and are responsible for following your local laws.
        </p>
        <p>
          Gambling problem? Call or text <a href="tel:18004264537" className="underline hover:text-gray-700">1-800-GAMBLER</a>.
          Links to sportsbooks may be affiliate links; Hammer may earn a commission at no cost to you.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 font-medium text-gray-600">
          <Link href="/terms" className="hover:text-gray-900">Terms &amp; Disclaimer</Link>
          <Link href="/responsible-gambling" className="hover:text-gray-900">Responsible Gambling</Link>
          <span className="text-gray-400">© {new Date().getFullYear()} Hammer · 21+</span>
        </div>
      </div>
    </footer>
  );
}
