import "server-only";

import { serverClient } from "@/lib/server-client";
import { AUTH_MD_PATH } from "@/lib/well-known/auth-md";

/**
 * Métadonnées de la ressource protégée (RFC 9728).
 *
 * Le document disait déjà quelle ressource et quel serveur d'autorisation ;
 * il ne disait pas ce qu'on peut demander, ni comment présenter le jeton une
 * fois obtenu. Un agent devait le déduire — et un agent qui déduit essaie, et
 * se fait jeter.
 *
 * `resource` reste le domaine de production : c'est le `aud` que le serveur
 * MCP vérifie, pas l'origine de la requête.
 */
const RESOURCE = "https://www.joutes.app";

/**
 * `scopes_supported` est absent, et ce n'est pas un oubli.
 *
 * Joutes ne définit aucun scope qui lui soit propre : `openid`, `profile`,
 * `email` et `offline_access` appartiennent au serveur d'autorisation, qui les
 * annonce déjà dans ses propres métadonnées. better-auth refuse de les
 * recopier ici — « Only the Auth Server should utilize the openid scope »,
 * puis « Unsupported scope profile » — et c'est tout le document qui tombe
 * avec eux. Un champ manquant se lit ; un 500 ne se lit pas.
 */
export async function protectedResourceMetadata(): Promise<Response> {
  const metadata = await serverClient.getProtectedResourceMetadata({
    resource: RESOURCE, // `aud` claim
    authorization_servers: [RESOURCE],
    // Le jeton se présente en en-tête, et nulle part ailleurs : ni en
    // paramètre d'URL, où il finirait dans les journaux, ni en corps de
    // formulaire.
    bearer_methods_supported: ["header"],
    resource_name: "Joutes",
    resource_documentation: `${RESOURCE}${AUTH_MD_PATH}`,
    resource_policy_uri: `${RESOURCE}/privacy`,
    resource_tos_uri: `${RESOURCE}/cgu`,
  });

  return new Response(JSON.stringify(metadata), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  });
}
