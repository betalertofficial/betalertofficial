/**
 * Whop (payments) helpers. Server-only: needs WHOP_API_KEY.
 * Hammer's Whop business + products were created via the API (Oct 2026).
 */
export const WHOP_COMPANY_ID = process.env.WHOP_COMPANY_ID || "biz_QnZXmc8N8bC0x8";
export const WHOP_SUPPORTER_PRODUCT = process.env.WHOP_SUPPORTER_PRODUCT || "prod_VWKQDL9sFdlUw";
export const WHOP_TIP_PRODUCT = process.env.WHOP_TIP_PRODUCT || "prod_Z9vwV6p9FPeIk";

/** Supporter perks. */
export const SUPPORTER_TRIGGER_LIMIT = 25;
export const FREE_TRIGGER_LIMIT = 3;
/** One-time tips get the supporter badge for this many days. */
export const TIP_BADGE_DAYS = 30;

const BASE = "https://api.whop.com/api/v1";

export async function whop<T = any>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const key = process.env.WHOP_API_KEY;
  if (!key) return { ok: false, status: 500, data: { error: "WHOP_API_KEY not configured" } as any };
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  return { ok: r.ok, status: r.status, data };
}

/** Product id from a payment / membership object (shapes vary slightly). */
export function productIdOf(obj: any): string | null {
  return obj?.product?.id ?? obj?.product_id ?? obj?.plan?.product?.id ?? obj?.access_pass?.id ?? null;
}
