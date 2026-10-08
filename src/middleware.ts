import { NextResponse, type NextRequest } from "next/server";

/**
 * Dashboard requires login. Visitors without a telegram_session cookie are sent
 * to the homepage (where the Telegram login lives) before the page even loads.
 *
 * The Telegram login redirect (/dashboard?id=…&hash=…) is let through: it has
 * no cookie yet — the dashboard exchanges those params for one.
 *
 * This only checks that the cookie exists; the dashboard itself verifies the
 * session (expired/invalid cookies are redirected client-side).
 */
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get("telegram_session")?.value);
  const isTelegramReturn = req.nextUrl.searchParams.has("hash") && req.nextUrl.searchParams.has("id");
  if (hasSession || isTelegramReturn) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard"],
};
