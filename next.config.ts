import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type checking runs in CI (GitHub Actions) — skip in Vercel build to avoid OOM
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
