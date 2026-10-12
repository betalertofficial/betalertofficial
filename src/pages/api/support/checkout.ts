import type { NextApiRequest, NextApiResponse } from "next";
import { sessionUserId } from "@/lib/serverAuth";
import { whop, WHOP_COMPANY_ID, WHOP_SUPPORTER_PRODUCT, WHOP_TIP_PRODUCT } from "@/lib/whop";

/**
 * POST /api/support/checkout  { amount: number, mode: "once" | "monthly" | "yearly" }
 *
 * Creates a Whop checkout for the signed-in user at the amount they chose
 * (pay what you want) and returns its URL. The user's profile id rides along
 * as metadata, so the webhook can map the payment back to them.
 */
const MODES = new Set(["once", "monthly", "yearly"]);
const MIN = 3;
const MAX = 500;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in" });

  const mode = String(req.body?.mode || "");
  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  if (!MODES.has(mode)) return res.status(400).json({ error: "Invalid mode" });
  if (!Number.isFinite(amount) || amount < MIN || amount > MAX) {
    return res.status(400).json({ error: `Amount must be between $${MIN} and $${MAX}` });
  }

  const recurring = mode !== "once";
  const label = mode === "once" ? `Tip $${amount}` : mode === "monthly" ? `Supporter $${amount}/mo` : `Supporter $${amount}/yr`;
  const plan: Record<string, unknown> = {
    company_id: WHOP_COMPANY_ID,
    product_id: recurring ? WHOP_SUPPORTER_PRODUCT : WHOP_TIP_PRODUCT,
    plan_type: recurring ? "renewal" : "one_time",
    initial_price: amount,
    currency: "usd",
    title: label,
    // Per-user custom-amount plans shouldn't clutter the public product page.
    visibility: "hidden",
  };
  if (recurring) {
    plan.renewal_price = amount;
    plan.billing_period = mode === "monthly" ? 30 : 365;
  }

  const r = await whop("POST", "/checkout_configurations", {
    plan,
    metadata: { profile_id: userId, kind: recurring ? "supporter" : "tip", mode },
    redirect_url: "https://www.hammer-app.com/dashboard?supported=1",
  });
  if (!r.ok || !r.data?.purchase_url) {
    console.error("[/api/support/checkout] whop error:", r.status, JSON.stringify(r.data)?.slice(0, 500));
    return res.status(502).json({ error: "Couldn't start checkout. Please try again." });
  }
  return res.status(200).json({ url: r.data.purchase_url });
}
