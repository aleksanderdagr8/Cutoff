import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
