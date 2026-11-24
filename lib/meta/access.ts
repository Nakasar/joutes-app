import "server-only";

import { NextResponse } from "next/server";

import { authenticateApiRequest } from "@/lib/api/authenticate";
import { anyUserHasPermission, hasPermission } from "@/lib/db/permissions";
import { hasEntitlement, userHasEntitlement } from "@/lib/subscriptions/access";
import { META_DECKS_PERMISSION } from "./permissions";
import { META_PAUSED, META_PAUSED_BODY } from "./paused";

/**
 * Qui voit la méta : les abonnés Joutes Expert (`sub:meta`), et les
 * gestionnaires de la méta (`metaDecks:manage`), qui doivent pouvoir vérifier
 * ce qu'ils importent sans abonnement. Les administrateurs ont les deux.
 *
 * Une seule règle pour toutes les portes : pages `/games/[jeu]/meta` (tournois,
 * joueurs, winrates), méta des groupes de jeu, routes de l'application mobile,
 * outils MCP et encart méta de l'email hebdomadaire. La gestion
 * (`/decks/meta/manage`) garde sa propre porte, la permission seule.
 */
export async function canSeeMeta(): Promise<boolean> {
  if (await hasEntitlement("sub:meta")) return true;
  return hasPermission(META_DECKS_PERMISSION);
}

/** La même règle pour un compte désigné (jeton MCP, clé API, envoi programmé). */
export async function userCanSeeMeta(userId: string): Promise<boolean> {
  if (await userHasEntitlement(userId, "sub:meta")) return true;
  return anyUserHasPermission([userId], META_DECKS_PERMISSION);
}

/**
 * La porte des routes REST de la méta (application mobile, clés API) : 401 sans
 * compte, 403 `code: "SUBSCRIPTION"` sans Joutes Expert — le code que lit
 * l'application pour montrer l'offre plutôt qu'une erreur.
 *
 * Les réponses qui passent cette porte dépendent du lecteur : elles se servent
 * en `Cache-Control: private` (`META_CACHE_CONTROL`), jamais `public`, sinon un
 * cache partagé les rendrait à qui n'y a pas droit.
 */
export async function readMetaReader(request: Request): Promise<{ userId: string } | { error: NextResponse }> {
  // Méta coupée (`./paused.ts`) : 503 avant même de lire le compte.
  if (META_PAUSED) return { error: metaPausedResponse() };
  const viewer = await authenticateApiRequest(request);
  if (!viewer) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }
  if (!(await userCanSeeMeta(viewer.userId))) {
    return {
      error: NextResponse.json(
        { error: "La méta est réservée aux abonnés Joutes Expert.", code: "SUBSCRIPTION" },
        { status: 403 },
      ),
    };
  }
  return viewer;
}

export const META_CACHE_CONTROL = "private, max-age=300";

/** La réponse des routes REST de la méta tant qu'elle est coupée (`./paused.ts`). */
export function metaPausedResponse(): NextResponse {
  return NextResponse.json(META_PAUSED_BODY, { status: 503, headers: { "Retry-After": "86400" } });
}
