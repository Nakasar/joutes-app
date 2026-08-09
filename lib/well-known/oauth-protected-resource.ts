import "server-only";

import { serverClient } from "@/lib/server-client";
import { AUTH_MD_PATH, MCP_TOKEN } from "@/lib/well-known/auth-md";

/**
 * Métadonnées de la ressource protégée (RFC 9728).
 *
 * Le document disait déjà quelle ressource et quel serveur d'autorisation ;
 * il ne disait pas ce qu'on peut demander, ni comment présenter le jeton une
 * fois obtenu. Un agent devait le déduire — et un agent qui déduit essaie, et
 * se fait jeter.
 *
 * Les deux identifiants viennent de `MCP_TOKEN`, c'est-à-dire de ce que le
 * serveur vérifie réellement, et non du domaine de production écrit à la main.
 * Écrits séparément, ils étaient tous les deux faux d'un cheveu — et un cheveu
 * suffit :
 *
 * - `resource` est l'identifiant que le client recopie dans le paramètre
 *   `resource` (RFC 8707) pour obtenir un jeton à la bonne audience. Sans la
 *   barre finale, il obtenait `aud: https://www.joutes.app`, que le serveur MCP
 *   rejette — il exige `https://www.joutes.app/`.
 * - `authorization_servers` attend des **identifiants d'émetteur**, pas
 *   l'adresse de la ressource. Le client qui y lisait `https://www.joutes.app`
 *   allait chercher les métadonnées à `/.well-known/oauth-authorization-server`
 *   et y trouvait un `issuer` différent de ce qu'il avait demandé : validation
 *   en échec. Avec l'émetteur, il vise
 *   `/.well-known/oauth-authorization-server/api/auth` — la variante qui existe
 *   précisément pour lui — et les deux concordent.
 */
const RESOURCE = MCP_TOKEN.audience;
const AUTHORIZATION_SERVER = MCP_TOKEN.issuer;

/** `RESOURCE` finit par une barre : concaténer y doublerait le séparateur. */
const resourceUrl = (path: string) => new URL(path, RESOURCE).toString();

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
    authorization_servers: [AUTHORIZATION_SERVER],
    // Le jeton se présente en en-tête, et nulle part ailleurs : ni en
    // paramètre d'URL, où il finirait dans les journaux, ni en corps de
    // formulaire.
    bearer_methods_supported: ["header"],
    resource_name: "Joutes",
    resource_documentation: resourceUrl(AUTH_MD_PATH),
    resource_policy_uri: resourceUrl("/privacy"),
    resource_tos_uri: resourceUrl("/cgu"),
  });

  return new Response(JSON.stringify(metadata), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  });
}
