/**
 * Ce que tout import de catalogue de produits refait à l'identique.
 *
 * Un import de gamme de figurines se résume à trois gestes, et seul le premier
 * dépend du jeu :
 *
 *  1. lire le catalogue chez l'éditeur — propre à chaque source ;
 *  2. recopier les images sur Vercel Blob — `next.config.ts` n'autorise
 *     `next/image` qu'à charger depuis ce domaine, un lien vers le site source
 *     ne s'afficherait pas ;
 *  3. écrire les produits sans effacer ce qui a été saisi à la main.
 *
 * Les points 2 et 3 vivent ici. Un script de jeu se réduit alors à bâtir sa
 * liste de `ImportedProduct` et à la passer à `importProducts`.
 *
 * Ce module ne s'exécute pas seul : il est importé par les
 * `import-products.ts` de chaque jeu.
 */
import { ObjectId } from "mongodb";
import { list, put } from "@vercel/blob";
import db from "../../lib/mongodb.ts";
import { cardAttributeKeySchema } from "../../lib/schemas/card.schema.ts";
import type { ProductAttributeValue, ProductContent } from "../../lib/types/product.ts";
import type { ProductKindKey } from "../../lib/constants/product-kinds.ts";

/** Nombre d'appels simultanés au site source, et d'envois simultanés au Blob. */
export const CONCURRENCY = 6;

/** Un produit tel qu'un import le décrit, avant toute écriture. */
export type ImportedProduct = {
  id: string;
  name: string;
  kind: ProductKindKey;
  /** Gamme ou vague : l'équivalent du `setCode` d'une carte. */
  setCode: string;
  /** Vide pour une feuille — une figurine, un accessoire. */
  contents: ProductContent[];
  /**
   * Attributs que la source connaît — l'édition d'un jeu qui en traverse
   * plusieurs, par exemple. Ils sont écrits **un à un**, sous leur propre clé :
   * les attributs saisis depuis l'administration que l'import ignore survivent
   * intacts à côté.
   */
  attributes?: Record<string, ProductAttributeValue>;
  /** URL de l'image chez l'éditeur, à recopier sur le Blob. */
  sourceImage: string;
  /**
   * Chemin de destination sur le Blob. Il doit être **déterministe** : c'est
   * lui qui permet à une seconde exécution de ne rien renvoyer.
   */
  imagePath: string;
};

/** Deux essais de plus avant d'abandonner : un site coupe parfois une connexion. */
export async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status} sur ${url}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Échec de ${url}`);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithRetry(url);
  return (await response.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetchWithRetry(url);
  return response.text();
}

/** `map` à parallélisme borné : un site source n'a pas à encaisser 100 requêtes d'un coup. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));

  return results;
}

/**
 * Valeur d'une option `--nom valeur`.
 *
 * Sans le contrôle, `--lang --dry-run` prendrait le drapeau suivant pour une
 * valeur, et l'import partirait chercher un catalogue en « --dry-run ».
 */
export function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`L'option ${name} attend une valeur.`);
  }

  return value;
}

/** Le jeu doit exister en base : un import ne crée pas de jeu. */
export async function resolveGameId(slug: string): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(`Aucun jeu avec le slug « ${slug} ».`);
  }

  return game._id;
}

/**
 * Deux produits de même identifiant se partageraient un document : le second
 * effacerait le premier sans que rien ne le signale, et l'identifiant étant
 * figé après création, la réparation coûterait une cascade sur les collections
 * et sur le contenu des autres produits. On s'arrête avant d'écrire.
 */
function assertUniqueIds(products: ImportedProduct[]): void {
  const byId = new Map<string, string[]>();
  for (const product of products) {
    byId.set(product.id, [...(byId.get(product.id) ?? []), product.name]);
  }

  const collisions = [...byId].filter(([, names]) => names.length > 1);
  if (collisions.length > 0) {
    throw new Error(
      `Identifiants en double : ${collisions
        .map(([id, names]) => `${id} (${names.join(", ")})`)
        .join(" ; ")}. Départagez-les avant d'importer.`
    );
  }
}

/**
 * Les clés d'attribut doivent être celles qu'accepte le formulaire.
 *
 * Elles sont écrites en **chemin** (`attributes.edition`) : un point ou un `$`
 * dans la clé creuserait une sous-arborescence, voire ferait échouer l'écriture.
 * Et une clé que `productSchema` refuse produirait un attribut impossible à
 * modifier depuis `/admin/products` — visible, mais hors d'atteinte.
 */
function assertAttributeKeys(products: ImportedProduct[]): void {
  const invalid = new Set<string>();
  for (const product of products) {
    for (const key of Object.keys(product.attributes ?? {})) {
      if (!cardAttributeKeySchema.safeParse(key).success) {
        invalid.add(key);
      }
    }
  }

  if (invalid.size > 0) {
    throw new Error(
      `Clés d'attribut refusées : ${[...invalid].map((key) => `« ${key} »`).join(", ")}. ` +
        `Une clé doit commencer par une lettre et ne contenir que lettres, chiffres et « _ ».`
    );
  }
}

/** Les images déjà recopiées, par chemin : une seconde exécution n'en renvoie aucune. */
async function listUploadedImages(prefix: string): Promise<Map<string, string>> {
  const uploaded = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: `${prefix}/`, limit: 1000, cursor });
    for (const blob of page.blobs) {
      uploaded.set(blob.pathname, blob.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return uploaded;
}

/**
 * Recopie sur le Blob les images qui n'y sont pas encore, et rend l'URL de
 * chacune. `next.config.ts` n'autorise `next/image` qu'à charger depuis ce
 * domaine : une image laissée chez l'éditeur ne s'afficherait pas.
 */
async function uploadImages(
  products: ImportedProduct[],
  prefix: string,
  refresh: boolean
): Promise<{ images: Map<string, string>; uploaded: number; reused: number }> {
  const existing = await listUploadedImages(prefix);
  const images = new Map<string, string>();
  let uploaded = 0;
  let reused = 0;

  await mapWithConcurrency(products, CONCURRENCY, async (product) => {
    const known = existing.get(product.imagePath);
    if (known && !refresh) {
      images.set(product.id, known);
      reused += 1;
      return;
    }

    const response = await fetchWithRetry(product.sourceImage);
    const blob = await put(product.imagePath, Buffer.from(await response.arrayBuffer()), {
      access: "public",
      contentType: "image/webp",
      // Le chemin est celui que l'import a calculé, et il doit rester le même
      // d'un passage à l'autre : ni suffixe aléatoire, ni refus d'écraser.
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    images.set(product.id, blob.url);
    uploaded += 1;
  });

  return { images, uploaded, reused };
}

/**
 * Produits déjà en base, réduits à ce qu'un import doit en savoir : ce qui
 * existe, et ce qui a été retouché à la main.
 */
async function loadExisting(gameId: ObjectId): Promise<Map<string, { manuallyEdited: boolean }>> {
  const docs = await db
    .collection("products")
    .find({ gameId }, { projection: { _id: 0, id: 1, manuallyEditedAt: 1 } })
    .toArray();

  return new Map(docs.map((doc) => [doc.id as string, { manuallyEdited: Boolean(doc.manuallyEditedAt) }]));
}

export type ImportOptions = {
  gameId: ObjectId;
  products: ImportedProduct[];
  /** Dossier des images sur le Blob, `products/<jeu>`. */
  blobPrefix: string;
  dryRun: boolean;
  /** Réécrit aussi les produits retouchés depuis l'administration. */
  force: boolean;
  /** Renvoie les images déjà sur le Blob au lieu de les réutiliser. */
  refreshImages: boolean;
};

/**
 * Écrit le catalogue, images comprises, et rend compte de ce qu'il a fait.
 *
 * Deux champs ne sont **jamais** touchés, et c'est ce qui rend l'import
 * rejouable : `attributes`, où vivent les attributs saisis depuis
 * l'administration (faction, points, mission…), et les marques de saisie
 * manuelle, qui servent justement à épargner un produit retouché.
 */
export async function importProducts({
  gameId,
  products,
  blobPrefix,
  dryRun,
  force,
  refreshImages,
}: ImportOptions): Promise<void> {
  assertUniqueIds(products);
  assertAttributeKeys(products);

  const existing = await loadExisting(gameId);
  const protectedIds = force
    ? []
    : products.filter((product) => existing.get(product.id)?.manuallyEdited).map((product) => product.id);

  if (protectedIds.length > 0) {
    console.info(
      `${protectedIds.length} produits modifiés à la main sont épargnés ` +
        `(${protectedIds.slice(0, 10).join(", ")}${protectedIds.length > 10 ? "…" : ""}). ` +
        `Ajoutez --force pour les réécrire.`
    );
  }

  const skipped = new Set(protectedIds);
  const writable = products.filter((product) => !skipped.has(product.id));
  const created = writable.filter((product) => !existing.has(product.id)).length;

  if (dryRun) {
    console.info(
      `\n--dry-run : ${writable.length} produits seraient écrits (${created} créés, ` +
        `${writable.length - created} mis à jour). Le Blob n'a pas été consulté.`
    );
    return;
  }

  console.info("Images...");
  const { images, uploaded, reused } = await uploadImages(writable, blobPrefix, refreshImages);
  console.info(`Images : ${uploaded} envoyées sur le Blob, ${reused} déjà en place.`);

  const operations = writable.map((product) => ({
    updateOne: {
      filter: { gameId, id: product.id },
      update: {
        $set: {
          name: product.name,
          kind: product.kind,
          setCode: product.setCode,
          ...(images.has(product.id) ? { image: images.get(product.id) } : {}),
          ...(product.contents.length > 0 ? { contents: product.contents } : {}),
          // Écrits par chemin (`attributes.edition`) et non en bloc : remplacer
          // `attributes` effacerait la faction, les points et tout ce qu'un
          // administrateur a saisi et que la source ignore.
          ...Object.fromEntries(
            Object.entries(product.attributes ?? {}).map(([key, value]) => [`attributes.${key}`, value])
          ),
        },
        // Un produit sans contenu est une feuille : le champ est retiré, pas
        // laissé à une liste vide, que `getProductGamesStats` compterait comme
        // un conteneur.
        ...(product.contents.length === 0 ? { $unset: { contents: "" } } : {}),
        $setOnInsert: { gameId, id: product.id, source: "import", createdAt: new Date() },
      },
      upsert: true,
    },
  }));

  const result = await db.collection("products").bulkWrite(operations, { ordered: false });

  console.info(
    `\n${result.upsertedCount} produits créés, ${result.modifiedCount} mis à jour, ` +
      `${writable.length - result.upsertedCount - result.modifiedCount} inchangés.`
  );
}
