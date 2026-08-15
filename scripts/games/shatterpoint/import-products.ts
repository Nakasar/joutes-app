/**
 * Import du catalogue de produits Star Wars: Shatterpoint.
 *
 * Le site communautaire shatterpoint-miniatures.eu publie en accès libre la
 * liste des extensions et leur contenu. Deux appels suffisent à reconstituer un
 * catalogue de produits complet :
 *
 *  - `GET /api/expansions` — les boîtes : code (`s`), nom (`n`), type (`t`) ;
 *  - `GET /api/expansions/SWP028` — le détail d'une boîte, dont `u`, la liste
 *    des unités qu'elle contient, chacune `[slug, nom, id]` ;
 *  - `GET /api/units` — les unités, dont `cn`, le **nombre de figurines** que
 *    l'unité représente. C'est lui qui donne la quantité d'une ligne de
 *    contenu : une unité de soutien vaut deux figurines dans la boîte.
 *
 * Les images ne sont pas dans l'API mais à un emplacement déductible du code de
 * l'extension et du slug de l'unité. Elles sont recopiées sur Vercel Blob :
 * `next.config.ts` n'autorise `next/image` qu'à charger depuis ce domaine, un
 * lien direct vers le site source ne s'afficherait pas.
 *
 * ## L'import est en anglais, volontairement
 *
 * L'API répond en français (`?lang=fr`), mais le catalogue déjà saisi à la main
 * est en anglais et ses identifiants dérivent des noms anglais
 * (`SWP-grand-admiral-thrawn`, `SWP-agent-kallus-inside-man`). Un import en
 * français créerait un second jeu de produits à côté du premier, au lieu de le
 * compléter — et le flux français laisse de toute façon la moitié des noms de
 * boîtes en anglais (« Not Accepting Surrenders », « Real Quiet Like »).
 *
 * `--lang fr` traduit les **noms affichés** si on le souhaite ; les identifiants,
 * eux, restent toujours dérivés de l'anglais. Ils sont figés après création (ils
 * sont référencés par les exemplaires en collection et par le contenu des autres
 * produits), ils ne peuvent pas dépendre de la langue d'un import.
 *
 * ## Identifiants
 *
 * | Produit | Identifiant | Exemple |
 * | --- | --- | --- |
 * | Boîte | le code de l'extension | `SWP028` |
 * | Figurine | `SWP-` + le nom anglais en minuscules | `SWP-grand-admiral-thrawn` |
 *
 * La gamme (`setCode`) vaut `SWP` pour tout le catalogue.
 *
 * ## Usage (depuis la racine du dépôt)
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/shatterpoint/import-products.ts [--dry-run] [--force] \
 *     [--lang fr] [--game shatterpoint] [--refresh-images]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - `--dry-run` : affiche le bilan sans rien écrire, ni en base ni sur le Blob ;
 * - `--force` : réécrit aussi les produits modifiés à la main depuis
 *   `/admin/products`, épargnés par défaut ;
 * - `--lang <code>` : langue des noms affichés, `en` par défaut ;
 * - `--game <slug>` : jeu à alimenter, `shatterpoint` par défaut ;
 * - `--refresh-images` : renvoie les images déjà présentes sur le Blob, au lieu
 *   de réutiliser celles qui y sont.
 *
 * Le script est **idempotent** : il n'écrit ni `attributes` ni les champs de
 * saisie manuelle, et une seconde exécution ne renvoie aucune image. Les
 * attributs saisis depuis l'administration (faction, points, mission…) lui
 * survivent donc.
 *
 * Les index doivent exister avant le premier import
 * (`npx tsx scripts/create-product-indexes.ts`), l'unicité de `{gameId, id}`
 * étant ce qui empêche l'import de créer des doublons.
 *
 * Variables d'environnement : `MONGODB_URI`, `BLOB_READ_WRITE_TOKEN`.
 */
import { ObjectId } from "mongodb";
import { list, put } from "@vercel/blob";
import db from "../../../lib/mongodb.ts";
import { normalizeContents } from "../../../lib/products/contents.ts";
import type { ProductContent } from "../../../lib/types/product.ts";
import type { ProductKindKey } from "../../../lib/constants/product-kinds.ts";

const API_BASE = "https://shatterpoint-miniatures.eu/api";
const IMAGE_BASE = "https://shatterpoint-miniatures.eu/images/shatterpoint";

/** Gamme unique du jeu : tout Shatterpoint sort sous la référence `SWP`. */
const SET_CODE = "SWP";

/** Préfixe des images recopiées sur le Blob, pour les retrouver et les lister. */
const BLOB_PREFIX = "products/shatterpoint";

/** Nombre d'appels simultanés au site source, et d'envois simultanés au Blob. */
const CONCURRENCY = 6;

/** Extension telle que la liste la renvoie. */
type ApiExpansion = {
  /** Code de l'extension, `SWP028`. */
  s: string;
  n: string;
  /** Type commercial : `Squad Pack`, `Terrain Pack`… */
  t: string;
};

/** Détail d'une extension : `u` liste ses unités, chacune `[slug, nom, id]`. */
type ApiExpansionDetail = ApiExpansion & { u?: [string, string, string][] };

type ApiUnit = {
  /** Slug de l'unité, `grandadmiralthrawn` — la clé de son image. */
  x: string;
  n: string;
  /** Nombre de figurines que l'unité représente : 2 pour une unité de soutien. */
  cn: number;
};

/**
 * Type commercial du site -> `kind` du catalogue.
 *
 * Le `kind` ne pilote aucun comportement : ce qui fait d'un produit un conteneur,
 * c'est son contenu (cf. `lib/constants/product-kinds.ts`). Il n'est ici qu'une
 * facette de filtre, et la table reprend les choix déjà faits à la main sur les
 * boîtes saisies avant cet import.
 */
const KIND_BY_EXPANSION_TYPE: Record<string, ProductKindKey> = {
  "Core Set": "starter",
  "Battle Set": "starter",
  "Squad Pack": "box",
  "Duel Pack": "box",
  "Unit Pack": "box",
  "Character Pack": "box",
  "Mission Pack": "other",
  "Terrain Pack": "accessory",
  "Dice Pack": "accessory",
  "Measuring Tools": "accessory",
};

/** Type inconnu : le produit entre quand même au catalogue, sous « Autre ». */
const FALLBACK_KIND: ProductKindKey = "other";

type ImportedProduct = {
  id: string;
  name: string;
  kind: ProductKindKey;
  contents: ProductContent[];
  /** URL de l'image sur le site source, à recopier sur le Blob. */
  sourceImage: string;
  /** Chemin de destination sur le Blob. */
  imagePath: string;
};

/**
 * Identifiant d'une figurine : `SWP-` et le nom anglais, accents retirés et
 * ponctuation réduite à des tirets — la forme qu'accepte `productIdSchema`.
 */
function unitId(englishName: string): string {
  const ascii = englishName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return `${SET_CODE}-${ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * Le site sert ses réponses depuis un CDN et les distingue par un paramètre
 * `version` que sa page pose à la compilation. L'horodatage de l'exécution joue
 * le même rôle : l'import lit toujours le catalogue à jour.
 */
function apiUrl(path: string, lang: string, version: number): string {
  return `${API_BASE}/${path}?lang=${lang}&version=${version}`;
}

/** Deux essais de plus avant d'abandonner : le site coupe parfois une connexion. */
async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithRetry(url);
  return (await response.json()) as T;
}

/** `map` à parallélisme borné : le site source n'a pas à encaisser 66 requêtes d'un coup. */
async function mapWithConcurrency<T, R>(
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

/** Le jeu doit exister en base : le script ne crée pas de jeu. */
async function resolveGameId(slug: string): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(`Aucun jeu avec le slug « ${slug} ».`);
  }

  return game._id;
}

/**
 * Le catalogue tel que le site le décrit : les figurines d'abord, les boîtes
 * ensuite, chacune renvoyant aux figurines par leur identifiant.
 */
async function buildCatalog(lang: string, version: number): Promise<{
  products: ImportedProduct[];
  unknownTypes: Map<string, string[]>;
}> {
  // L'anglais est lu dans tous les cas : les identifiants en dérivent, et la
  // table des `kind` est indexée sur les types anglais.
  const [englishUnits, englishExpansions] = await Promise.all([
    fetchJson<ApiUnit[]>(apiUrl("units", "en", version)),
    fetchJson<ApiExpansion[]>(apiUrl("expansions", "en", version)),
  ]);

  const [translatedUnits, translatedExpansions] = lang === "en"
    ? [englishUnits, englishExpansions]
    : await Promise.all([
        fetchJson<ApiUnit[]>(apiUrl("units", lang, version)),
        fetchJson<ApiExpansion[]>(apiUrl("expansions", lang, version)),
      ]);

  const displayUnitNames = new Map(translatedUnits.map((unit) => [unit.x, unit.n]));
  const displayExpansionNames = new Map(translatedExpansions.map((expansion) => [expansion.s, expansion.n]));

  const units = new Map(
    englishUnits.map((unit) => [
      unit.x,
      {
        id: unitId(unit.n),
        name: displayUnitNames.get(unit.x) ?? unit.n,
        // Une unité de soutien tient sur une carte mais compte deux figurines
        // dans la boîte ; c'est ce nombre-là qui fait la quantité du contenu.
        copies: Math.max(1, unit.cn),
      },
    ])
  );

  const unitProducts: ImportedProduct[] = [...units].map(([slug, unit]) => ({
    id: unit.id,
    name: unit.name,
    kind: "unit",
    contents: [],
    sourceImage: `${IMAGE_BASE}/units/art/${slug}.webp`,
    imagePath: `${BLOB_PREFIX}/units/${slug}.webp`,
  }));

  // Le contenu n'est pas dans la liste des extensions : il faut le détail de
  // chacune.
  const details = await mapWithConcurrency(englishExpansions, CONCURRENCY, (expansion) =>
    fetchJson<ApiExpansionDetail>(apiUrl(`expansions/${expansion.s}`, "en", version))
  );

  const unknownTypes = new Map<string, string[]>();

  const boxProducts: ImportedProduct[] = details.map((detail) => {
    const kind = KIND_BY_EXPANSION_TYPE[detail.t];
    if (!kind) {
      unknownTypes.set(detail.t, [...(unknownTypes.get(detail.t) ?? []), detail.s]);
    }

    // Une unité absente de `/api/units` n'a ni identifiant ni quantité fiables :
    // la citer produirait une ligne de contenu pointant dans le vide.
    const contents = (detail.u ?? []).flatMap((entry) => {
      const unit = units.get(entry[0]);
      return unit ? [{ productId: unit.id, quantity: unit.copies }] : [];
    });

    return {
      id: detail.s,
      name: displayExpansionNames.get(detail.s) ?? detail.n,
      kind: kind ?? FALLBACK_KIND,
      contents: normalizeContents(contents),
      sourceImage: `${IMAGE_BASE}/expansions/${detail.s}.webp`,
      imagePath: `${BLOB_PREFIX}/expansions/${detail.s}.webp`,
    };
  });

  const products = [...unitProducts, ...boxProducts];

  // Deux figurines de même nom anglais se partageraient un identifiant, donc un
  // document : la seconde effacerait la première sans que rien ne le signale, et
  // l'identifiant étant figé après création, la réparation coûterait une cascade
  // sur les collections et le contenu des boîtes. On s'arrête avant d'écrire.
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

  return { products, unknownTypes };
}

/** Les images déjà recopiées, par chemin : une seconde exécution n'en renvoie aucune. */
async function listUploadedImages(): Promise<Map<string, string>> {
  const uploaded = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: `${BLOB_PREFIX}/`, limit: 1000, cursor });
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
 * domaine : une image laissée sur le site source ne s'afficherait pas.
 */
async function uploadImages(
  products: ImportedProduct[],
  { refresh }: { refresh: boolean }
): Promise<{ images: Map<string, string>; uploaded: number; reused: number }> {
  const existing = await listUploadedImages();
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
      // Le chemin porte le code de l'extension ou le slug de l'unité : il doit
      // rester le même d'un import à l'autre, donc ni suffixe aléatoire, ni
      // refus d'écraser.
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    images.set(product.id, blob.url);
    uploaded += 1;
  });

  return { images, uploaded, reused };
}

/**
 * Produits déjà en base, réduits à ce que l'import doit en savoir : ce qui a été
 * retouché à la main, et ce qui existe déjà.
 */
async function loadExisting(gameId: ObjectId): Promise<Map<string, { manuallyEdited: boolean }>> {
  const docs = await db
    .collection("products")
    .find({ gameId }, { projection: { _id: 0, id: 1, manuallyEditedAt: 1 } })
    .toArray();

  return new Map(docs.map((doc) => [doc.id as string, { manuallyEdited: Boolean(doc.manuallyEditedAt) }]));
}

async function main() {
  const args = process.argv.slice(2);
  // `--lang --dry-run` prendrait le drapeau suivant pour une valeur, et l'import
  // partirait chercher un catalogue en « --dry-run » sans rien écrire de clair.
  const argValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    if (index < 0) {
      return undefined;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`L'option ${name} attend une valeur.`);
    }

    return value;
  };

  const slug = argValue("--game") ?? "shatterpoint";
  const lang = argValue("--lang") ?? "en";
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const refreshImages = args.includes("--refresh-images");

  const gameId = await resolveGameId(slug);
  console.info(`Jeu « ${slug} » (${gameId}).`);

  console.info("Lecture du catalogue de shatterpoint-miniatures.eu...");
  const { products, unknownTypes } = await buildCatalog(lang, Date.now());

  const boxes = products.filter((product) => product.contents.length > 0);
  const leaves = products.length - boxes.length;
  console.info(
    `${products.length} produits : ${boxes.length} avec un contenu, ${leaves} sans ` +
      `(figurines, terrains, accessoires).`
  );

  for (const [type, codes] of unknownTypes) {
    console.warn(
      `Type d'extension inconnu « ${type} » (${codes.join(", ")}) : importé en « ${FALLBACK_KIND} ». ` +
        `Ajoutez-le à KIND_BY_EXPANSION_TYPE.`
    );
  }

  // --- Ce qui a été retouché à la main -----------------------------------

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

  // --- Les images ---------------------------------------------------------

  console.info("Images...");
  const { images, uploaded, reused } = await uploadImages(writable, { refresh: refreshImages });
  console.info(`Images : ${uploaded} envoyées sur le Blob, ${reused} déjà en place.`);

  // --- L'écriture ---------------------------------------------------------

  const operations = writable.map((product) => ({
    updateOne: {
      filter: { gameId, id: product.id },
      update: {
        $set: {
          name: product.name,
          kind: product.kind,
          setCode: SET_CODE,
          ...(images.has(product.id) ? { image: images.get(product.id) } : {}),
          ...(product.contents.length > 0 ? { contents: product.contents } : {}),
        },
        // Un produit sans contenu est une feuille : le champ est retiré, pas
        // laissé à une liste vide, que `getProductGamesStats` compterait comme
        // un conteneur.
        ...(product.contents.length === 0 ? { $unset: { contents: "" } } : {}),
        // Ni `attributes` ni `manuallyEditedAt` ne sont touchés : les attributs
        // saisis depuis l'administration (faction, points, mission…) survivent
        // à l'import.
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
