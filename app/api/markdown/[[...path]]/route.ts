import {
  estimateTokens,
  htmlToMarkdown,
  isNegotiablePath,
  MARKDOWN_CONTENT_TYPE,
  MARKDOWN_SOURCE_HEADER,
} from "@/lib/well-known/markdown-negotiation";

/**
 * La page demandée, rendue puis convertie en markdown.
 *
 * `next.config.ts` n'aiguille ici que les requêtes portant
 * `Accept: text/markdown` ; un navigateur ne passe jamais par cette route.
 *
 * La page est récupérée par une requête interne plutôt que rendue à nouveau :
 * c'est le seul moyen d'obtenir exactement ce que voit un lecteur, sans
 * dupliquer la mise en page de chaque route dans une seconde implémentation
 * qui divergerait.
 */

/** Le rendu dépend de la requête : rien à figer au build. */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  const requested = new URL(request.url);
  // Derrière le proxy de la plateforme, `request.url` peut porter l'hôte
  // interne : ce sont les en-têtes transmis qui disent sous quel nom la page a
  // été demandée, et donc laquelle aller chercher.
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = forwardedHost
    ? `${request.headers.get("x-forwarded-proto") ?? requested.protocol.replace(":", "")}://${forwardedHost}`
    : requested.origin;
  const pathname = `/${(path ?? []).join("/")}`.replace(/\/+$/, "") || "/";

  if (!isNegotiablePath(pathname)) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const target = new URL(pathname + requested.search, origin);

  const upstream = await fetch(target, {
    headers: {
      // Ce qu'on veut convertir, et ce qui interdit à la réécriture de se
      // redéclencher sur notre propre requête.
      Accept: "text/html",
      [MARKDOWN_SOURCE_HEADER]: "1",
      "Accept-Language": request.headers.get("accept-language") ?? "fr",
    },
    // Aucun cookie n'est transmis : la version markdown est la version
    // anonyme. Reprendre la session de l'appelant ferait entrer du contenu
    // personnel dans une réponse que l'on met en cache.
    cache: "no-store",
    redirect: "follow",
  });

  if (!upstream.ok) {
    return new Response(`Upstream responded ${upstream.status}`, {
      status: upstream.status,
      headers: { "Content-Type": "text/plain", Vary: "Accept" },
    });
  }

  // Une redirection a pu nous emmener ailleurs — sur une préproduction
  // protégée, c'est la page de connexion de la plateforme qui répond. Convertir
  // ce qu'on trouve au bout sans regarder d'où ça vient donnerait le markdown
  // d'un site qui n'est pas le nôtre.
  if (upstream.url && new URL(upstream.url).origin !== new URL(origin).origin) {
    return new Response("Upstream redirected off-origin", {
      status: 502,
      headers: { "Content-Type": "text/plain", Vary: "Accept" },
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    // Une route qui ne rend pas de HTML n'a rien à convertir : on rend ce
    // qu'elle a produit plutôt que d'en faire de la prose.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        Vary: "Accept",
      },
    });
  }

  const markdown = htmlToMarkdown(await upstream.text());

  return new Response(markdown, {
    headers: {
      "Content-Type": MARKDOWN_CONTENT_TYPE,
      // Ordre de grandeur, pour budgéter avant de lire.
      "x-markdown-tokens": String(estimateTokens(markdown)),
      // Sans cela, un cache intermédiaire servirait ce markdown au navigateur
      // suivant qui demande la même URL en HTML.
      Vary: "Accept",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
