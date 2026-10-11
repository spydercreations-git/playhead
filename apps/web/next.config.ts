import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: process.env.API_URL
          ? `${process.env.API_URL}/api/v1/:path*`
          : "http://localhost:8080/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
