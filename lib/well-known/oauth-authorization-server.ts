import "server-only";

import { auth } from "@/lib/auth";
import { buildAgentAuth } from "@/lib/well-known/auth-md";

/**
 * Les métadonnées du serveur d'autorisation (RFC 8414), augmentées du bloc
 * `agent_auth` qui dit à un agent par où commencer.
 *
 * Trois routes servent ce document — la racine, le suffixe d'émetteur, et le
 * chemin `api/auth` — parce que le client cherche le `.well-known` là où son
 * émetteur le lui indique. Elles partagent ce handler : trois copies auraient
 * fini par ne plus dire la même chose.
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
