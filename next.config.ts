import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { HOMEPAGE_LINK_HEADER } from "./lib/well-known/api-catalog";

const withNextIntl = createNextIntlPlugin();

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
      allowedOrigins: process.env.NODE_ENV === "development" ? ["localhost:3000", process.env.DEV_URL ?? "localhost:3000"] : undefined,
    }
  },
  async headers() {
    return [
      {
        // L'accueil est la porte d'entrée d'un agent : c'est là qu'il faut lui
        // dire où sont l'API, sa description et ses conditions, sans qu'il ait
        // à deviner des URL ni à lire la page.
        source: "/",
        headers: [
          {
            // Une seule valeur portant tous les liens, séparés par des
            // virgules, comme le prévoit la RFC 8288 : deux entrées de même
            // clé se remplaceraient l'une l'autre.
            key: "Link",
            value: HOMEPAGE_LINK_HEADER,
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
