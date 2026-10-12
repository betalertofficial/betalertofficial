import type { NextApiRequest, NextApiResponse } from "next";
import { serviceClient } from "@/lib/serverAuth";
import { sendTelegramMessage } from "@/services/telegramService";
import {
  whop,
  productIdOf,
  WHOP_SUPPORTER_PRODUCT,
  WHOP_TIP_PRODUCT,
  SUPPORTER_TRIGGER_LIMIT,
  FREE_TRIGGER_LIMIT,
  TIP_BADGE_DAYS,
} from "@/lib/whop";

/**
 * POST /api/whop/webhook
 *
 * Whop payment/membership events. We never trust the payload: every event is
 * re-fetched from the Whop API with our key, so a forged request can't grant
 * perks. Each event is recorded once in whop_events (idempotent).
 */
const ACTIVE = new Set(["active", "trialing"]);

function evtType(e: any): string {
  return String(e?.type || e?.action || e?.event || "");
}

async function seen(supabase: ReturnType<typeof serviceClient>, id: string, type: string, profileId: string | null, amount: number | null, payload: any) {
  const { error } = await supabase.from("whop_events").insert({ id, type, profile_id: profileId, amount, payload } as any);
  // 23505 = duplicate key → already processed
  return error?.code === "23505";
}

async function thank(supabase: ReturnType<typeof serviceClient>, profileId: string, text: string) {
  const { data } = await supabase.from("profiles").select("telegram_chat_id").eq("id", profileId).maybeSingle();
  const chatId = (data as any)?.telegram_chat_id;
  if (chatId) await sendTelegramMessage({ chatId, text, parseMode: "HTML" });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const evt = req.body ?? {};
  const type = evtType(evt);
  const objId: string | undefined = evt?.data?.id;
  if (!type || !objId) return res.status(200).json({ ok: true, ignored: true });

  let supabase;
  try {
    supabase = serviceClient();
  } catch {
    return res.status(500).json({ error: "Server not configured" });
  }

  try {
    // ── One-time tips and recurring renewals ───────────────────────────
    if (type === "payment.succeeded") {
      const r = await whop("GET", `/payments/${encodeURIComponent(objId)}`);
      const p = r.data;
      if (!r.ok || !p) return res.status(502).json({ error: "verify failed" });
      const status = String(p.status || "").toLowerCase();
      if (status && status !== "paid" && status !== "succeeded") return res.status(200).json({ ok: true, skipped: status });
      const product = productIdOf(p);
      const profileId: string | null = p.metadata?.profile_id ?? p.membership?.metadata?.profile_id ?? null;
      const amount = Number(p.total ?? p.subtotal ?? p.final_amount ?? p.amount ?? 0) || null;
      if (!profileId || (product && product !== WHOP_TIP_PRODUCT && product !== WHOP_SUPPORTER_PRODUCT)) {
        return res.status(200).json({ ok: true, ignored: "unmapped" });
      }
      if (await seen(supabase, `pay:${objId}`, type, profileId, amount, { product, status })) {
        return res.status(200).json({ ok: true, duplicate: true });
      }

      if (product === WHOP_TIP_PRODUCT || p.metadata?.kind === "tip") {
        const { data: prof } = await supabase.from("profiles").select("supporter_until").eq("id", profileId).maybeSingle();
        const cur = (prof as any)?.supporter_until ? new Date((prof as any).supporter_until).getTime() : 0;
        const until = new Date(Math.max(Date.now(), cur) + TIP_BADGE_DAYS * 86400000).toISOString();
        await supabase.from("profiles").update({ supporter_until: until } as any).eq("id", profileId);
        await thank(
          supabase,
          profileId,
          `💚 <b>Thank you for supporting Hammer!</b>${amount ? ` Your $${amount} tip` : " Your tip"} helps cover live odds data and keeps alerts running. You've got a supporter badge for the next ${TIP_BADGE_DAYS} days. 🔨`
        );
      }
      return res.status(200).json({ ok: true });
    }

    // ── Supporter memberships ──────────────────────────────────────────
    if (type.startsWith("membership.")) {
      const r = await whop("GET", `/memberships/${encodeURIComponent(objId)}`);
      const m = r.data;
      if (!r.ok || !m) return res.status(502).json({ error: "verify failed" });
      if (productIdOf(m) && productIdOf(m) !== WHOP_SUPPORTER_PRODUCT) return res.status(200).json({ ok: true, ignored: "product" });

      let profileId: string | null = m.metadata?.profile_id ?? null;
      if (!profileId) {
        const { data } = await supabase.from("profiles").select("id").eq("whop_membership_id", objId).maybeSingle();
        profileId = (data as any)?.id ?? null;
      }
      if (!profileId) return res.status(200).json({ ok: true, ignored: "unmapped" });

      const status = String(m.status || "").toLowerCase();
      const isActive = ACTIVE.has(status);
      const periodEnd: string | null = m.renewal_period_end || m.expires_at || null;
      await seen(supabase, `mem:${objId}:${type}:${status}:${periodEnd ?? ""}`, type, profileId, null, { status, periodEnd });

      const { data: prof } = await supabase.from("profiles").select("subscription_tier").eq("id", profileId).maybeSingle();
      const wasSupporter = (prof as any)?.subscription_tier === "supporter";

      if (isActive) {
        await supabase
          .from("profiles")
          .update({
            subscription_tier: "supporter",
            trigger_limit: SUPPORTER_TRIGGER_LIMIT,
            whop_membership_id: objId,
            whop_user_id: m.user?.id ?? null,
            supporter_until: periodEnd,
          } as any)
          .eq("id", profileId);
        if (!wasSupporter) {
          await thank(
            supabase,
            profileId,
            `💚 <b>Welcome, Hammer Supporter!</b>\n\nThank you for backing Hammer. Your perks are live:\n• Up to ${SUPPORTER_TRIGGER_LIMIT} active triggers\n• Supporter badge on your dashboard\n\nManage or cancel any time at whop.com. 🔨`
          );
        }
      } else if (wasSupporter) {
        await supabase
          .from("profiles")
          .update({ subscription_tier: "free", trigger_limit: FREE_TRIGGER_LIMIT, supporter_until: null } as any)
          .eq("id", profileId);
        await thank(supabase, profileId, "Your Hammer Supporter membership has ended. Thanks for backing Hammer! You can rejoin any time from your dashboard.");
      }
      return res.status(200).json({ ok: true, active: isActive });
    }

    return res.status(200).json({ ok: true, ignored: type });
  } catch (e) {
    console.error("[/api/whop/webhook] error:", e);
    return res.status(500).json({ error: "webhook failed" });
  }
}
