import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable sharp for image processing on Vercel
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // External packages that need native binaries
  serverExternalPackages: ['sharp'],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

export default nextConfig;
