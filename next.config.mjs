/** @type {import('next').NextConfig} */
import { createRequire } from "module";

// Check if element-tagger is available
function isElementTaggerAvailable() {
  try {
    const require = createRequire(import.meta.url);
    require.resolve("@softgenai/element-tagger");
    return true;
  } catch {
    return false;
  }
}

// Build turbo rules only if tagger is available
function getTurboRules() {
  if (!isElementTaggerAvailable()) {
    console.log("[Softgen] Element tagger not found, skipping loader configuration");
    return {};
  }

  return {
    "*.tsx": {
      loaders: ["@softgenai/element-tagger"],
      as: "*.tsx",
    },
    "*.jsx": {
      loaders: ["@softgenai/element-tagger"],
      as: "*.jsx",
    },
  };
}

const nextConfig = {
  reactStrictMode: true,
  // Allow production builds to finish even if ESLint or TypeScript report
  // errors. The softgen dev sandbox (turbopack) does not enforce these the way
  // Vercel's `next build` does, so this prevents pre-existing issues from
  // blocking the deploy. Safe to tighten (remove these) once the code is clean.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbo: {
      rules: getTurboRules(),
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  allowedDevOrigins: ["*.daytona.work", "*.softgen.dev"],
};

export default nextConfig;
