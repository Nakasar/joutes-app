import {
  buildMcpServerCard,
  MCP_SERVER_CARD_MEDIA_TYPE,
} from "@/lib/well-known/mcp-server-card";

/**
 * La même carte, à côté du serveur qu'elle décrit : la spécification réserve
 * `<url-du-serveur>/server-card` pour le client qui tient déjà l'URL du
 * transport et n'a pas de raison de remonter au domaine.
 */
export async function GET(request: Request) {
  const card = buildMcpServerCard(new URL(request.url).origin);

  return new Response(JSON.stringify(card, null, 2), {
    headers: {
      "Content-Type": MCP_SERVER_CARD_MEDIA_TYPE,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
