import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // build autocontenido para la imagen Docker (infra/saros)
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
};

export default nextConfig;
