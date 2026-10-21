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
      {
        source: "/collab/:path*",
        destination: process.env.COLLAB_URL
          ? `${process.env.COLLAB_URL}/:path*`
          : "http://localhost:8082/:path*",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/projects",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/projects/:id",
        destination: "/library/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
