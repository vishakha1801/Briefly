import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Multiple lockfiles exist above this project; pin the workspace root so
  // Turbopack resolves modules from here.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
