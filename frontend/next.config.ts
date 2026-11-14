import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // build autocontenido para la imagen Docker (infra/tenua)
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
