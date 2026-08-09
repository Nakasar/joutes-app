import { auth } from "@/lib/auth";
import { AUTH_MD_MEDIA_TYPE, buildAuthMd } from "@/lib/well-known/auth-md";

/**
 * `/auth.md`, le mode d'emploi que lit un agent avant de demander un accès.
 *
 * Ses URL sortent des métadonnées du serveur d'autorisation plutôt que d'une
 * liste tenue à la main : le document décrit ainsi le serveur qui le sert, en
 * production comme en préproduction et en local.
 */
export async function GET(request: Request) {
  const metadata = await auth.api.getOAuthServerConfig({ request, asResponse: false });
  const document = buildAuthMd(metadata, new URL(request.url).origin);

  return new Response(document, {
    headers: {
      "Content-Type": AUTH_MD_MEDIA_TYPE,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
