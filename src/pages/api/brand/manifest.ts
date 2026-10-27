import type { NextApiRequest, NextApiResponse } from "next";

/** Web app manifest so "Add to Home Screen" uses the Hammer icon. */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.status(200).json({
    name: "Hammer",
    short_name: "Hammer",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#111111",
    theme_color: "#111111",
    icons: [
      { src: "/api/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/api/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
}
