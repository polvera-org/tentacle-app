import type { NextConfig } from "next";
import path from "node:path";

const browserNodeShim = path.join(process.cwd(), 'lib/shims/empty-object.ts')
const browserPathPolyfill = 'next/dist/compiled/path-browserify'
const browserUrlPolyfill = 'next/dist/compiled/native-url'

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_WEBSITE_URL: process.env.NEXT_PUBLIC_WEBSITE_URL,
    NEXT_PUBLIC_PRO_WAITLIST_URL: process.env.NEXT_PUBLIC_PRO_WAITLIST_URL,
  },
  turbopack: {
    resolveAlias: {
      // Keep `path`/`url` functional via browser polyfills and stub server-only modules.
      fs: './lib/shims/empty-object.ts',
      path: browserPathPolyfill,
      url: browserUrlPolyfill,
      sharp: './lib/shims/empty-object.ts',
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {}
      config.resolve.alias = config.resolve.alias ?? {}
      Object.assign(config.resolve.alias, {
        fs: browserNodeShim,
        path: browserPathPolyfill,
        url: browserUrlPolyfill,
        sharp: browserNodeShim,
      })
    }

    return config
  },
};

export default nextConfig;
