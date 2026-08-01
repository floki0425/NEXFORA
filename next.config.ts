import type { NextConfig } from "next";

const e2eDistDir = process.env.NEXFORA_NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  ...(e2eDistDir ? { distDir: e2eDistDir } : {}),
};

export default nextConfig;
