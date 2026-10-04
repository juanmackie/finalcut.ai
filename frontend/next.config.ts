import type { NextConfig } from "next";

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
