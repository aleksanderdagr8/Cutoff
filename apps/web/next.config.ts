import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Markdown lives outside `src/` and is read while blog routes render.
  // Trace it into the server bundle so a Worker re-render can still see posts.
  outputFileTracingIncludes: {
    "/blog": ["./content/blog/**/*"],
    "/blog/[slug]": ["./content/blog/**/*"],
    "/blog/rss.xml": ["./content/blog/**/*"],
    "/sitemap.xml": ["./content/blog/**/*"],
  },
  transpilePackages: [
    "@cutoff/adapters",
    "@cutoff/contracts",
    "@cutoff/db",
    "@cutoff/domain",
  ],
  webpack: (config) => {
    // Workspace packages use TS ESM with `.js` import specifiers.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;

// Bindings + Workers-shaped env during `next dev` (no-op in production builds).
initOpenNextCloudflareForDev();
