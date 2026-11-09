import "server-only";

import { lookup } from "node:dns/promises";

import { ipLiteralOf, isBlockedIpAddress, parsePublicHttpUrl } from "@/lib/net/public-url";

/**
 * Aller chercher une adresse **qu'un utilisateur a saisie**, depuis le serveur.
 *
 * Une telle requête part de notre réseau : sans précaution, elle atteint ce
 * que l'appelant ne pourrait pas joindre lui-même — la boucle locale, un
 * réseau privé, le service de métadonnées de l'hébergeur. Deux contrôles, à
 * chaque saut :
 *
 * - le nom d'hôte est résolu et **toutes** ses adresses doivent être
 *   publiques (`lib/net/public-url.ts`) ;
 * - les redirections sont suivies à la main, pour revérifier la cible de
 *   chacune : une redirection vers `127.0.0.1` annulerait sinon le contrôle
 *   initial.
 *
 * Partagé par l'import d'actualités (`lib/news/fetch-source.ts`) et la lecture
 * des pages d'événements (`lib/services/refresh-events.ts`).
 */

const DEFAULT_MAX_REDIRECTS = 5;

export type SafeFetchFailure = "invalid-url" | "unsupported-protocol" | "private-address" | "unreachable";

export type SafeFetchInit = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxRedirects?: number;
};

export type SafeFetchResult = { response: Response; finalUrl: URL } | { failure: SafeFetchFailure };

/** Vraie si le nom d'hôte se résout entièrement vers des adresses publiques. */
export async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  // Une URL déjà écrite en IP se juge directement, v4 comme v6 : la résoudre
  // ne renverrait rien de plus, et `dns.lookup` sur une IPv6 littérale échoue
  // selon la plateforme — ce qui refuserait une adresse publique parfaitement
  // valide.
  const literal = ipLiteralOf(hostname);
  if (literal) return !isBlockedIpAddress(literal);

  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.length > 0 && addresses.every((entry) => !isBlockedIpAddress(entry.address));
  } catch {
    return false;
  }
}

/**
 * Rend la réponse finale, quel que soit son statut : c'est à l'appelant de
 * dire ce qu'il fait d'un 404. Les redirections, elles, ne ressortent jamais.
 */
export async function safeFetch(rawUrl: string | URL, init: SafeFetchInit): Promise<SafeFetchResult> {
  const parsed = parsePublicHttpUrl(rawUrl.toString());
  if ("rejection" in parsed) {
    return { failure: rejectionToFailure(parsed.rejection) };
  }

  let url = parsed.url;
  let method = init.method ?? "GET";
  let body = init.body;
  let headers = init.headers ?? {};
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!(await resolvesToPublicAddress(url.hostname))) {
      return { failure: "private-address" };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch {
      return { failure: "unreachable" };
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      // Le corps d'une redirection ne sert à rien : le libérer évite de tenir
      // la connexion ouverte pendant qu'on suit le saut suivant.
      await response.body?.cancel().catch(() => undefined);

      const next = parsePublicHttpUrl(new URL(location, url).toString());
      if ("rejection" in next) {
        return { failure: rejectionToFailure(next.rejection) };
      }
      url = next.url;

      // Comme un navigateur : seuls 307 et 308 rejouent la méthode et le
      // corps ; les autres redirections d'un POST se suivent en GET.
      if (method === "POST" && response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = undefined;
        headers = Object.fromEntries(
          Object.entries(headers).filter(([name]) => name.toLowerCase() !== "content-type"),
        );
      }
      continue;
    }

    return { response, finalUrl: url };
  }

  return { failure: "unreachable" };
}

function rejectionToFailure(rejection: "invalid" | "protocol" | "private"): SafeFetchFailure {
  if (rejection === "private") return "private-address";
  if (rejection === "protocol") return "unsupported-protocol";
  return "invalid-url";
}
