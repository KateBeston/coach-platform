import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Receipts are uploaded through a server action; allow photos up to 10 MB.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
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
