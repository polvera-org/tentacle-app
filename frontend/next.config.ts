import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed 'output: export' to support dynamic routes
  // Tauri can run Next.js in production mode without static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
