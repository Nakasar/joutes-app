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
  }
};

export default nextConfig;
