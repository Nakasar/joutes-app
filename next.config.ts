import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uiez8a3cxaj4q4wl.public.blob.vercel-storage.com",
        port: "",
        pathname: "/**",
      }
    ]
  },
  experimental: {
    serverActions: {
      allowedOrigins: process.env.NODE_ENV === "development" ? ["localhost:3000", process.env.DEV_URL!] : undefined,
    }
  },
};

export default nextConfig;
