import "server-only";

import { auth } from "@/lib/auth";
import { buildAgentAuth } from "@/lib/well-known/auth-md";

/**
 * Les métadonnées du serveur d'autorisation (RFC 8414), augmentées du bloc
 * `agent_auth` qui dit à un agent par où commencer.
 *
 * Quatre routes servent ce document, parce que le client cherche le
 * `.well-known` là où son émetteur le lui indique : la racine, le suffixe
 * d'émetteur, `/.well-known/oauth-authorization-server/api/auth` (l'insertion
 * de chemin de la RFC 8414) et `/api/auth/.well-known/oauth-authorization-server`
 * (la forme préfixée par l'émetteur).
 *
 * Cette dernière servait les métadonnées brutes de better-auth, sans
 * `agent_auth` — et c'est précisément celle que lit un client parti des
 * métadonnées de la ressource, qui annoncent `https://…/api/auth` comme
 * serveur d'autorisation. Le bloc existait donc partout sauf à l'adresse où on
 * allait le chercher. Les quatre partagent ce handler : quatre copies
 * finiraient par ne plus dire la même chose, et c'est exactement ce qui était
 * arrivé.
 */
export async function authorizationServerMetadata(request: Request): Promise<Response> {
  const metadata = await auth.api.getOAuthServerConfig({ request, asResponse: false });

  const document = {
    ...metadata,
    agent_auth: buildAgentAuth(metadata, new URL(request.url).origin),
  };

  return new Response(JSON.stringify(document), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  });
}
