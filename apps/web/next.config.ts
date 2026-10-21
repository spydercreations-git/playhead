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
      {
        source: "/my-drive/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/my-drive",
        destination: "/",
        permanent: true,
      },
      {
        source: "/drive/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/drive",
        destination: "/",
        permanent: true,
      },
      {
        source: "/spreadsheets/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/spreadsheets",
        destination: "/",
        permanent: true,
      },
      {
        source: "/sheet/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/sheet",
        destination: "/",
        permanent: true,
      },
      {
        source: "/reviews/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/reviews",
        destination: "/",
        permanent: true,
      },
      {
        source: "/shared-with-me/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/shared-with-me",
        destination: "/",
        permanent: true,
      },
      {
        source: "/starred/:path*",
        destination: "/",
        permanent: true,
      },
      {
        source: "/starred",
        destination: "/",
        permanent: true,
      },
      {
        source: "/d/:id",
        destination: "/documents/:id",
        permanent: true,
      },
      {
        source: "/library/projects/:projectId/documents/:id",
        destination: "/documents/:id",
        permanent: true,
      },
      {
        source: "/projects/:projectId/documents/:id",
        destination: "/documents/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
