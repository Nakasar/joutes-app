import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { HOMEPAGE_LINK_HEADER } from "./lib/well-known/api-catalog";
import { MARKDOWN_NEGOTIATION_EXCLUDED } from "./lib/well-known/markdown-negotiation";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
  // `Vary: Accept` n'est posé que sur la réponse markdown, dans la route qui
  // la produit. Le déclarer ici pour les pages HTML ne sert à rien : App Router
  // réécrit `Vary` lui-même (`rsc, next-router-state-tree, …`) et efface la
  // valeur configurée — vérifié en ajoutant un second en-tête au même bloc, qui
  // lui arrive bien. Ce n'est pas gênant : en production, ces pages sortent en
  // `private, no-cache, no-store`, donc aucun cache partagé ne les retient,
  // alors que la réponse markdown, elle, est publiquement cacheable et porte
  // son `Vary`.
  async rewrites() {
    return {
      // Avant les fichiers : la page existe, c'est justement elle qu'on veut
      // servir autrement.
      beforeFiles: [
        {
          // L'accueil a sa propre règle : un paramètre de chemin ne capture
          // pas la chaîne vide, et c'est précisément la page qu'un agent
          // demande en premier.
          source: "/",
          has: [{ type: "header", key: "accept", value: "(.*)text/markdown(.*)" }],
          destination: "/api/markdown",
        },
        {
          // Un agent qui demande du markdown reçoit du markdown ; un
          // navigateur, qui ne demande jamais ce type, ne voit pas la
          // différence. Les chemins écartés servent déjà du JSON ou du
          // markdown : les convertir ferait de la prose avec un linkset.
          source: `/:path((?!${MARKDOWN_NEGOTIATION_EXCLUDED}).*)`,
          has: [{ type: "header", key: "accept", value: "(.*)text/markdown(.*)" }],
          destination: "/api/markdown/:path",
        },
      ],
    };
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
