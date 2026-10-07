import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The CSV import accepts files up to 1 MiB (the API's limit). The action body also carries
      // multipart overhead, so the cap sits just above it; an oversized file then reaches the
      // import action's friendly error instead of a generic framework rejection.
      bodySizeLimit: "1.1mb",
    },
  },
};

export default nextConfig;
