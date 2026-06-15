import { useState } from "react";

/**
 * Small team logo image that simply disappears if the URL fails to load.
 * For chips that need an initials fallback, see PickATeam's TeamLogo.
 */
export function TeamLogoImg({ url, alt, className }: { url: string | null; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!url || err) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} loading="lazy" onError={() => setErr(true)} />;
}
