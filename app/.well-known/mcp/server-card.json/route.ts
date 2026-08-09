import {
  buildMcpServerCard,
  MCP_SERVER_CARD_MEDIA_TYPE,
} from "@/lib/well-known/mcp-server-card";

/**
 * La carte du serveur MCP, à l'emplacement `.well-known` où la cherchent les
 * clients qui partent d'un domaine plutôt que d'une URL de serveur.
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
