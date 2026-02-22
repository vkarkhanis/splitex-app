import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  compiler: {
    styledComponents: true,
  },
  transpilePackages: ['@splitex/shared', '@splitex/ui'],
};

export default nextConfig;
