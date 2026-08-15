import "server-only";

import { lookup } from "node:dns/promises";
import { ipLiteralOf, isBlockedIpAddress, parsePublicHttpUrl } from "@/lib/net/public-url";

/**
 * Récupération d'une page extérieure et de ses images, pour l'import d'une
 * actualité.
 *
 * Trois précautions, parce que l'URL vient d'un formulaire et que la requête
 * part du serveur :
 * - chaque nom d'hôte est résolu et ses adresses vérifiées avant l'appel
 *   (`lib/net/public-url.ts`), y compris à chaque redirection — une
 *   redirection vers `127.0.0.1` annulerait sinon le contrôle initial ;
 * - la réponse est lue avec un plafond d'octets, pour qu'un fichier immense
 *   ne remplisse pas la mémoire du serveur ;
 * - le tout sous délai, pour qu'un serveur qui ne répond jamais ne retienne
 *   pas la requête.
 */

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;

/** Une page d'article dépasse rarement 2 Mo de HTML, scripts compris. */
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

/** Même plafond que le téléversement d'une bannière (`/api/news/upload`). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Se présenter honnêtement : un site qui refuse les robots doit pouvoir le faire. */
const USER_AGENT = "JoutesNewsImporter/1.0 (+https://joutes.app)";

export type FetchFailure =
  | "invalid-url"
  | "unsupported-protocol"
  | "private-address"
  | "unreachable"
  | "http-error"
  | "too-large"
  | "not-html";

export type FetchedPage = { html: string; finalUrl: string };

/** Vraie si le nom d'hôte se résout entièrement vers des adresses publiques. */
async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
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
 * Suit les redirections à la main plutôt que de les confier à `fetch` : c'est
 * le seul moyen de revérifier chaque étape. Rend la réponse finale.
 */
async function fetchFollowingSafeRedirects(
  startUrl: URL,
  accept: string
): Promise<{ response: Response; finalUrl: URL } | { failure: FetchFailure }> {
  let url = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await resolvesToPublicAddress(url.hostname))) {
      return { failure: "private-address" };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
        return { failure: next.rejection === "private" ? "private-address" : "unsupported-protocol" };
      }
      url = next.url;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { failure: "http-error" };
    }

    return { response, finalUrl: url };
  }

  return { failure: "unreachable" };
}

/** Lit le corps d'une réponse en s'arrêtant net au-delà du plafond. */
async function readCappedBody(response: Response, maxBytes: number): Promise<Uint8Array | undefined> {
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }

  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Le jeu de caractères annoncé par la réponse, à défaut UTF-8. */
function charsetOf(contentType: string | null): string {
  const declared = /charset=([^;]+)/i.exec(contentType ?? "")?.[1]?.trim().replace(/^["']|["']$/g, "");
  return declared || "utf-8";
}

/** Va chercher le HTML de la page à importer. */
export async function fetchSourcePage(
  rawUrl: string
): Promise<{ page: FetchedPage } | { failure: FetchFailure }> {
  const parsed = parsePublicHttpUrl(rawUrl);
  if ("rejection" in parsed) {
    return {
      failure:
        parsed.rejection === "protocol"
          ? "unsupported-protocol"
          : parsed.rejection === "private"
            ? "private-address"
            : "invalid-url",
    };
  }

  const result = await fetchFollowingSafeRedirects(parsed.url, "text/html,application/xhtml+xml");
  if ("failure" in result) return result;

  const contentType = result.response.headers.get("content-type");
  if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
    await result.response.body?.cancel().catch(() => undefined);
    return { failure: "not-html" };
  }

  const body = await readCappedBody(result.response, MAX_PAGE_BYTES);
  if (!body) return { failure: "too-large" };

  let html: string;
  try {
    html = new TextDecoder(charsetOf(contentType)).decode(body);
  } catch {
    html = new TextDecoder("utf-8").decode(body);
  }

  return { page: { html, finalUrl: result.finalUrl.toString() } };
}

export type FetchedImage = { bytes: Uint8Array; contentType: string; finalUrl: string };

/**
 * Va chercher une image de l'article. Rend `undefined` sur le moindre
 * problème : une image manquante fait un import moins complet, jamais un
 * import raté — le markdown garde alors l'adresse d'origine.
 */
export async function fetchSourceImage(rawUrl: string): Promise<FetchedImage | undefined> {
  const parsed = parsePublicHttpUrl(rawUrl);
  if ("rejection" in parsed) return undefined;

  const result = await fetchFollowingSafeRedirects(parsed.url, "image/*");
  if ("failure" in result) return undefined;

  const contentType = result.response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    await result.response.body?.cancel().catch(() => undefined);
    return undefined;
  }

  const bytes = await readCappedBody(result.response, MAX_IMAGE_BYTES);
  if (!bytes || bytes.byteLength === 0) return undefined;

  return { bytes, contentType, finalUrl: result.finalUrl.toString() };
}
