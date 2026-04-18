import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  compiler: {
    styledComponents: true,
  },
  transpilePackages: ['@traxettle/shared', '@traxettle/ui'],
};

export default nextConfig;
