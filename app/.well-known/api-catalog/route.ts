import {
  API_CATALOG_MEDIA_TYPE,
  buildApiCatalog,
} from "@/lib/well-known/api-catalog";

/**
 * Catalogue des API de Joutes (RFC 9727), vers lequel pointe l'en-tête `Link`
 * de l'accueil. L'origine vient de la requête : le document reste juste en
 * préproduction et en local, où le domaine n'est pas celui de production.
 */
export async function GET(request: Request) {
  const catalog = buildApiCatalog(new URL(request.url).origin);

  return new Response(JSON.stringify(catalog, null, 2), {
    headers: {
      "Content-Type": API_CATALOG_MEDIA_TYPE,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
