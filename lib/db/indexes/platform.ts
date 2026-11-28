import type { IndexDefinition } from "./ensure";

/** Ce qui n'appartient à aucun domaine du jeu : les garde-fous de la plateforme. */
export const PLATFORM_INDEXES: IndexDefinition[] = [
  {
    collection: "rateLimits",
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
    why: "Efface seuls les compteurs de limite de débit périmés (`lib/net/rate-limit.ts`)",
  },
];
