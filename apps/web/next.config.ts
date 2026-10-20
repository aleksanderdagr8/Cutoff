import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Bundle content/blog into src/lib/blog/sources.generated.ts before Next
// compiles server code. OpenNext's default cache does not keep prerendered
// HTML, so the Worker re-renders these routes and cannot read the repo.
function bundleBlogSources(): void {
  const candidates = [process.cwd(), path.join(process.cwd(), "apps", "web")];
  const webRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "scripts", "generate-blog-sources.mjs")),
  );
  if (!webRoot) {
    throw new Error("generate-blog-sources.mjs not found from " + process.cwd());
  }
  const generated = spawnSync(
    process.execPath,
    [path.join(webRoot, "scripts", "generate-blog-sources.mjs")],
    { stdio: "inherit" },
  );
  if (generated.status !== 0) {
    throw new Error("Failed to bundle blog markdown");
  }
}

bundleBlogSources();

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

// Bindings + Workers-shaped env during `next dev` (no-op in production builds).
initOpenNextCloudflareForDev();
