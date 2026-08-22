import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AI-rendered visuals travel through Server Actions as base64 data URIs when
  // Supabase storage is not configured — a single 1024px PNG can exceed 1MB,
  // which would crash the action against the default 1MB body limit and surface
  // the opaque "Server Components render" digest error in production.
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
