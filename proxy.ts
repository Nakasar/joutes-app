import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createIntlProxy from 'next-intl/middleware'

import { routing } from '@/i18n/routing'
import { isCredentialedOrigin } from '@/lib/net/own-origins'

const intlProxy = createIntlProxy(routing);

/**
 * Deux responsabilités qui ne se croisent jamais, sur deux familles d'adresses
 * disjointes : le CORS pour l'API, la résolution de langue pour les pages.
 *
 * L'API ne passe pas par la langue — ses réponses sont du JSON, pas des pages —
 * et les pages n'ont pas besoin du CORS. Les traiter dans le même passage évite
 * d'avoir deux proxys, que Next ne permet de toute façon pas.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const res = NextResponse.next();

    // Le cookie de session n'est accordé qu'à nos propres pages et à
    // l'application mobile (`lib/net/own-origins.ts`). Renvoyer l'origine
    // appelante quelle qu'elle soit, avec `Allow-Credentials`, laissait
    // n'importe quel site lire l'API au nom d'un compte connecté dès que le
    // navigateur joignait le cookie.
    //
    // Les autres origines restent servies, sans identifiants : l'API publique
    // et les clés `jts_…` (en-tête `Authorization`, qui n'est pas un
    // « identifiant » au sens du CORS) continuent de fonctionner depuis un
    // site tiers.
    if (isCredentialedOrigin(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin!);
      res.headers.set("Access-Control-Allow-Credentials", "true");
    } else if (origin) {
      res.headers.set("Access-Control-Allow-Origin", "*");
    }
    // La réponse dépend de l'origine : un cache partagé ne doit pas servir à
    // l'une les en-têtes calculés pour l'autre.
    res.headers.append("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return res;
  }

  // Hors API, seule reste la négociation de langue : `next-intl` lit le
  // préfixe s'il y en a un, sinon le cookie `NEXT_LOCALE`, sinon
  // `accept-language` — exactement l'ordre que `getUserLocale` appliquait au
  // rendu, désormais résolu avant lui.
  //
  // Aucun en-tête CORS ici : le proxy ne s'exécutait jusqu'ici que sur `/api/`,
  // les pages n'en ont jamais porté, et ce n'est pas à cette migration d'en
  // ajouter.
  return intlProxy(request);
}

export const config = {
  /*
   * Tout sauf ce qui n'est ni une page ni l'API : les fichiers internes de
   * Next, les ressources statiques, et les adresses qui doivent rester à la
   * racine quelle que soit la langue — découverte (`.well-known`), robots et
   * plans de site, MCP, et les fichiers d'icônes servis depuis `app/`.
   */
  matcher: [
    '/((?!_next|_vercel|\\.well-known|mcp|discord|auth\\.md|robots\\.txt|sitemap\\.xml|sitemap_index\\.xml|sitemaps|favicon\\.ico|icon\\.png|apple-icon\\.png|.*\\..*).*)',
  ],
};
