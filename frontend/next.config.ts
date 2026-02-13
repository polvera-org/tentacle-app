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
  turbopack: {
    resolveAlias: {
      // @xenova/transformers imports Node modules in browser builds.
      // Keep `path`/`url` functional via browser polyfills and stub truly server-only modules.
      fs: './lib/shims/empty-object.ts',
      path: browserPathPolyfill,
      url: browserUrlPolyfill,
      sharp: './lib/shims/empty-object.ts',
      'onnxruntime-node': './lib/shims/empty-object.ts',
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
        'onnxruntime-node': browserNodeShim,
      })
    }

    return config
  },
};

export default nextConfig;
