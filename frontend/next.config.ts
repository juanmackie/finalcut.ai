import type { NextConfig } from "next";

// Vercel/env values frequently carry stray CR/LF (e.g. NEXT_PUBLIC_API_URL="https://.../api\r").
// NEXT_PUBLIC_* values are inlined verbatim into the bundle and BACKEND_URL goes into the
// rewrite rules, so normalize them here before the config is read.
for (const key of ["NODE_ENV", "NEXT_PUBLIC_API_URL", "BACKEND_URL"]) {
  if (process.env[key]) process.env[key] = process.env[key]!.trim();
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      // Agent avatars are user-supplied URLs — allowlist broad https for observer avatars.
      { protocol: "https", hostname: "**" },
    ],
  },
  async rewrites() {
    // Local + docker dev: NEXT_PUBLIC_API_URL=/api routes to the Express backend.
    // In production (Vercel) /api is served by api/index.ts, so this is a no-op fallback.
    const dest = process.env.BACKEND_URL || "http://localhost:4000/api/:path*";
    if (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL !== "/api") return [];
    return [{ source: "/api/:path*", destination: dest }];
  },
};

export default nextConfig;
