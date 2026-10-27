import Head from 'next/head';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

// SEO elements that can be used in _document.tsx (returns JSX without Head wrapper)
export function SEOElements({
  title = "Hammer",
  description = "Set highly customized alert conditions and get a Telegram message the moment it hits.",
  image = "/og-image.png",
  url,
}: SEOProps) {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="icon" type="image/png" sizes="48x48" href="/api/brand/favicon-48.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/api/brand/favicon-32.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/api/brand/apple-touch-icon.png" />
      <link rel="manifest" href="/api/brand/manifest" />
      <meta name="theme-color" content="#111111" />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {image && <meta property="og:image" content={image} />}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:type" content="website" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </>
  );
}

// SEO component for use in pages/_app.tsx or individual pages (uses next/head)
// Note: Flattened structure (no fragment) for better Next.js Head compatibility during hot reload
export function SEO({
  title = "Hammer",
  description = "Set highly customized alert conditions and get a Telegram message the moment it hits.",
  image,
  url,
}: SEOProps) {
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="icon" type="image/png" sizes="48x48" href="/api/brand/favicon-48.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/api/brand/favicon-32.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/api/brand/apple-touch-icon.png" />
      <link rel="manifest" href="/api/brand/manifest" />
      <meta name="theme-color" content="#111111" />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {image && <meta property="og:image" content={image} />}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:type" content="website" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </Head>
  );
}
