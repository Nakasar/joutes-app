import "server-only";

import { parsePublicHttpUrl } from "@/lib/net/public-url";
import { safeFetch } from "@/lib/net/safe-fetch";

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

/**
 * La lecture protégée (`lib/net/safe-fetch.ts`), avec nos en-têtes et notre
 * règle : une réponse en erreur n'est pas une page.
 */
async function fetchFollowingSafeRedirects(
  startUrl: URL,
  accept: string
): Promise<{ response: Response; finalUrl: URL } | { failure: FetchFailure }> {
  const result = await safeFetch(startUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
  });
  if ("failure" in result) return result;

  if (!result.response.ok) {
    await result.response.body?.cancel().catch(() => undefined);
    return { failure: "http-error" };
  }

  return result;
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
