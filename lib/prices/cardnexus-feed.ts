import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import type { CardnexusFeedMetadata, CardnexusFeeds } from "@/lib/prices/cardnexus";

/**
 * Téléchargement des feeds CardNexus.
 *
 * En deux temps, comme l'API l'impose : on demande d'abord les métadonnées du
 * feed — qui portent un lien signé à durée limitée, la date du contenu et son
 * empreinte —, puis on télécharge ce lien. Le fichier est un NDJSON gzippé :
 * il est décompressé et lu **ligne à ligne**, jamais chargé d'un bloc. Le
 * catalogue d'un gros jeu pèse plusieurs mégaoctets une fois compressé, et
 * beaucoup plus une fois ouvert.
 *
 * Module serveur : il ouvre des flux gzip. Ce que le navigateur peut charger
 * (identifiants de jeu, types, lien vers un produit) vit dans `cardnexus.ts`.
 */

const API = "https://public-api.cardnexus.com/v1";

/** Les deux premiers octets d'un fichier gzip. */
function isGzip(chunk: Buffer): boolean {
  return chunk.length >= 2 && chunk[0] === 0x1f && chunk[1] === 0x8b;
}

/**
 * Un appel à l'API CardNexus. Les erreurs de la clé (401, 403) et les excès de
 * requêtes (429) sont définitifs : les réessayer ne ferait que perdre du temps
 * et, pour le 429, creuser le dépassement. Le reste est réessayé — l'import
 * dure plusieurs minutes, un incident réseau isolé ne doit pas tout perdre.
 */
async function apiGet<T>(path: string, apiKey: string, attempt = 1): Promise<T> {
  const MAX_ATTEMPTS = 4;

  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
  }).catch((error: unknown) => error as Error);

  if (response instanceof Response && response.ok) {
    return (await response.json()) as T;
  }

  if (response instanceof Response && [401, 403, 429].includes(response.status)) {
    throw new Error(
      `HTTP ${response.status} sur ${path} : ` +
        (response.status === 429
          ? "quota d'appels CardNexus dépassé."
          : "la clé CARDNEXUS_API_KEY est absente, invalide, révoquée ou sans accès à l'API.")
    );
  }

  if (attempt >= MAX_ATTEMPTS) {
    throw response instanceof Response ? new Error(`HTTP ${response.status} sur ${path}`) : response;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
  return apiGet<T>(path, apiKey, attempt + 1);
}

/** Métadonnées d'un feed : `catalog`, `expansions` ou `prices`. */
export async function fetchCardnexusFeed(
  gameId: string,
  feed: "catalog" | "expansions" | "prices",
  apiKey: string
): Promise<CardnexusFeedMetadata> {
  return apiGet<CardnexusFeedMetadata>(`/feeds/${encodeURIComponent(gameId)}/${feed}`, apiKey);
}

/** Les trois feeds d'un jeu, demandés d'un coup. */
export async function fetchCardnexusFeeds(gameId: string, apiKey: string): Promise<CardnexusFeeds> {
  const [expansions, catalog, prices] = await Promise.all([
    fetchCardnexusFeed(gameId, "expansions", apiKey),
    fetchCardnexusFeed(gameId, "catalog", apiKey),
    fetchCardnexusFeed(gameId, "prices", apiKey),
  ]);

  return { expansions, catalog, prices };
}

/**
 * Les lignes d'un feed, une à une.
 *
 * Le lien est signé : il n'est pas authentifié par la clé, et il expire. Le
 * fichier est du gzip **comme format**, pas comme encodage de transport — le
 * client HTTP ne le décompresse donc pas tout seul. Il arrive pourtant que le
 * stockage annonce l'encodage et que le client s'en charge : les premiers
 * octets tranchent, plutôt que de faire confiance aux en-têtes.
 */
export async function* streamCardnexusFeed<T>(feed: CardnexusFeedMetadata): AsyncGenerator<T> {
  const response = await fetch(feed.url);

  if (!response.ok || !response.body) {
    throw new Error(
      `HTTP ${response.status} au téléchargement du feed ${feed.feedType}` +
        (Date.parse(feed.urlExpiresAt) < Date.now() ? " : le lien signé a expiré, redemandez-le." : ".")
    );
  }

  const chunks = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])[Symbol.asyncIterator]();
  const head = await chunks.next();

  if (head.done) {
    return;
  }

  const bytes = Readable.from(
    (async function* () {
      yield head.value;
      // Le premier morceau est déjà consommé : la suite reprend l'itérateur.
      while (true) {
        const next = await chunks.next();
        if (next.done) return;
        yield next.value;
      }
    })()
  );

  const input = isGzip(Buffer.from(head.value)) ? bytes.pipe(createGunzip()) : bytes;

  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (line.trim()) {
      yield JSON.parse(line) as T;
    }
  }
}
