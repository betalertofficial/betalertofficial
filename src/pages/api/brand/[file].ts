import type { NextApiRequest, NextApiResponse } from "next";
import { BRAND_ICONS } from "@/lib/brandIcons";

/** GET /api/brand/{file}: Hammer app icons (favicon, apple-touch-icon, PWA sizes). */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const file = String(req.query.file || "");
  const b64 = BRAND_ICONS[file];
  if (!b64) return res.status(404).end();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
  return res.status(200).send(Buffer.from(b64, "base64"));
}
