/**
 * Import du catalogue Cyberpunk TCG depuis l'API que sert cyberpunktcg.com
 * (https://cyberpunktcg.com/cards, API https://api.netdeck.gg/api/cards/cyberpunk).
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/cyberpunk/import-cards.ts [--fetch-only|--from-file] [--refresh-images]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - sans option : télécharge le catalogue, recopie les illustrations sur le
 *   Blob, écrit le tout dans `cards.json`, puis pousse en base et dans l'index
 *   de recherche ;
 * - `--fetch-only` : s'arrête après `cards.json` — le Blob, lui, a bien été
 *   écrit (voir « Les illustrations ne survivent pas à leur URL » plus bas :
 *   sans recopie, `cards.json` ne porterait que des liens périmés) ;
 * - `--from-file` : réécrit en base depuis `cards.json`, sans retélécharger ni
 *   retoucher au Blob ;
 * - `--refresh-images` : renvoie sur le Blob les illustrations qui y sont déjà.
 *   À utiliser quand la source a réédité un rendu — le chemin d'une image ne
 *   dépendant que de l'impression, une image inchangée n'est jamais renvoyée.
 *
 * Variables d'environnement : `MONGODB_URI`, `MEILISEARCH_ENDPOINT`,
 * `MEILISEARCH_API_KEY`, `BLOB_READ_WRITE_TOKEN`, et `CYBERPUNK_GAME_SLUG` si
 * le jeu n'a pas le slug `cp`.
 *
 * Après le premier import, les filtres de la galerie demandent que l'index
 * déclare les attributs du jeu : c'est le bouton « Mettre à jour l'index » de
 * l'administration des cartes, cf. docs/CARD_EXPLORER_FILTERS.md. Le script le
 * fait déjà pour ce jeu, à chaque exécution.
 *
 * ## Une carte, ses impressions, et deux routes pour les avoir
 *
 * La source distingue la **carte** (un nom, un texte, un coût) de ses
 * **impressions** : la même carte est tirée dans la version « Retail » et dans
 * la version « Beta » d'une extension, dans les decks de démonstration, en box
 * topper, en promo… La liste (`/api/cards/cyberpunk`) ne rend jamais ces
 * impressions — `printings` y est toujours vide —, seule la fiche
 * (`/api/cards/cyberpunk/<slug>`) les publie. Les deux routes sont donc
 * appelées : la liste pour connaître le catalogue, une fiche par carte pour
 * ses tirages.
 *
 * L'impression que la source met en avant (`printing_id`) devient la carte de
 * l'application — c'est elle qui donne l'extension, le numéro et donc
 * l'identifiant —, les autres deviennent ses variantes (cf.
 * docs/CARD_PRINTINGS.md). C'est le découpage de la source elle-même : son
 * site présente une carte et laisse choisir le tirage, exactement comme la
 * fiche de carte d'ici.
 *
 * L'identifiant d'une variante est celui de l'impression chez la source (un
 * UUID). Ni son nom ni son extension ne feraient l'affaire : vingt-neuf cartes
 * ont **deux tirages dans une même extension** (deux illustrations d'une même
 * carte Beta, par exemple), et un identifiant dérivé du nom les départagerait
 * par un suffixe qui dépendrait de l'ordre de lecture — il changerait donc
 * d'un import à l'autre, alors que les collections le référencent.
 *
 * ## Les codes d'extension sont raccourcis ici
 *
 * La source nomme ses extensions par un slug entier :
 * `embracingpowerretailstarterdeck`, trente-et-un caractères, quand
 * `cardSchema` en accepte vingt pour un code d'extension — et qu'un code sert
 * de préfixe à l'identifiant de la carte, affiché partout. Chaque extension
 * connue reçoit donc ici un code court, et il est **figé** : le changer
 * changerait les identifiants, donc casserait les collections déjà saisies.
 *
 * Seule l'extension de l'impression de référence donne un code — une variante
 * porte le *nom* de son extension, pas son code. La table couvre pourtant les
 * douze extensions : celle qui n'est aujourd'hui qu'un tirage secondaire
 * deviendra une référence dès que la source y publiera une carte exclusive, et
 * son code doit alors être déjà choisi, pas dérivé dans l'urgence.
 *
 * Une extension inconnue n'arrête pas l'import : son slug, réduit aux lettres
 * et aux chiffres et tronqué, lui tient lieu de code, avec un avertissement —
 * c'est le signal qu'il faut lui donner sa place dans la table ci-dessous
 * *avant* que quiconque ait collectionné ses cartes.
 *
 * ## Les illustrations ne survivent pas à leur URL
 *
 * La source sert ses images depuis un CloudFront signé : l'URL qu'elle rend
 * porte une signature valable vingt-quatre heures, et la même URL sans
 * signature répond 403. Recopier ce lien en base donnerait des cartes
 * illustrées le jour de l'import et vides le lendemain. Les images sont donc
 * recopiées sur le Blob, comme le fait déjà l'import des produits
 * (`scripts/games/product-import.ts`), sous un chemin qui ne dépend que de
 * l'impression : une seconde exécution ne renvoie rien.
 *
 * ## Ce qui est écarté de la source
 *
 * - `legality` : vaut « legal » sur les cent quarante-neuf cartes. Une valeur
 *   constante ne filtrerait rien, et l'application a déjà son propre
 *   bannissement, piloté depuis la fiche de carte ;
 * - `finish` : renseigné sur aucune impression. Rien ne dit donc qu'un tirage
 *   soit foil, et `foil` n'est écrit sur aucune carte ni variante ;
 * - `flavor_text` : `null` partout ;
 * - `subname` / `display_name` : `subname` est `null` partout, et
 *   `display_name` répète `name` ;
 * - `external_id` : l'identifiant de la carte chez la source, que rien ici ne
 *   sait rapprocher de quoi que ce soit.
 */
import { readFile, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import { list, put } from "@vercel/blob";
import db from "../../../lib/mongodb.ts";
import meilisearch, { cardIndexSettings, ensureCardIndex, indexes } from "../../../lib/meilisearch.ts";
import { getGameCardFilterFacets } from "../../../lib/db/cards.ts";
import { importedCardSearchDocument } from "../../../lib/cards/import-search.ts";
import { buildCardId, withUniquePrintingIds } from "../../../lib/constants/card-ids.ts";
import { MAX_CARD_PRINTINGS } from "../../../lib/schemas/card.schema.ts";
import type { CardPrinting } from "../../../lib/types/card.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API = "https://api.netdeck.gg/api/cards/cyberpunk";

/** Convention d'identifiant du jeu, indépendante du slug qu'il porte en base. */
const GAME = "cp";

/** Slug du jeu en base. Surchargeable si le jeu a été créé sous un autre slug. */
const GAME_SLUG = process.env.CYBERPUNK_GAME_SLUG ?? GAME;

/** Le catalogue n'est publié qu'en anglais. */
const LANGUAGE = "en";

/** Dossier des illustrations sur le Blob. */
const BLOB_PREFIX = `cards/${GAME}`;

const CARDS_FILE = path.join(__dirname, "cards.json");

/** Cartes demandées par page à la liste, et appels simultanés à la source. */
const PAGE_SIZE = 100;
const CONCURRENCY = 6;

/**
 * Code d'extension de l'application, par slug d'extension de la source.
 *
 * Ces codes sont **figés** : ils préfixent les identifiants de carte, que les
 * collections référencent. Les tirages « Beta » d'une extension prennent le
 * code de l'extension suivi d'un `B`, comme leurs numéros de collection
 * prennent un `β`.
 */
const SET_CODES: Record<string, string> = {
  welcometonightcityretail: "WNC",
  welcometonightcitybeta: "WNCB",
  embracingpowerretailstarterdeck: "EPS",
  embracingpowerbetastarterdeck: "EPSB",
  theheistretailstarterdeck: "THS",
  theheistbetastarterdeck: "THSB",
  boxtoppersretail: "BXT",
  boxtoppersbeta: "BXTB",
  arasakademodeck: "ADD",
  mercdemodeck: "MDD",
  prereleasebeta: "PRB",
  PRM01: "PRM01",
};

/** Longueur qu'accepte `cardSchema` pour un code d'extension. */
const MAX_SET_CODE_LENGTH = 20;

// --- Types de l'API ------------------------------------------------------

type ApiSet = { code: string; name: string };

/** Un tirage précis d'une carte : son extension, son numéro et son rendu. */
type ApiPrinting = {
  id: string;
  collector_number: string | null;
  image_url: string | null;
  set: ApiSet | null;
  rarity: string | null;
  finish: string | null;
  artist: string | null;
};

type ApiCard = {
  id: string;
  name: string;
  slug: string;
  rules_text: string | null;
  /** Impression mise en avant, celle dont la carte reprend extension et numéro. */
  printing_id: string | null;
  set: ApiSet | null;
  rarity: string | null;
  image_url: string | null;
  color: string | null;
  card_type: string | null;
  is_eddiable: boolean | null;
  classifications: string[] | null;
  keywords: string[] | null;
  cost: number | null;
  power: number | null;
  ram: number | null;
  artist: string | null;
  print_number: string | null;
  /** Toujours vide sur la liste, renseigné sur la fiche d'une carte. */
  printings: ApiPrinting[] | null;
};

type ApiPage = { items: ApiCard[]; total: number; limit: number; offset: number };

// --- Carte telle qu'on la stocke ----------------------------------------

export type CyberpunkCard = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  lang: string;
  image?: string;
  text?: string;
  printings?: CardPrinting[];
  // Attributs de jeu, écrits à la racine du document comme pour les autres
  // jeux. Les clés reprennent celles des filtres de la source, à un détail
  // près : ses « classifications » sont ses `tags` — c'est le libellé qu'elle
  // leur donne, et la clé que la fiche de carte d'ici sait afficher.
  setName: string;
  type?: string;
  rarity?: string;
  color?: string;
  tags?: string[];
  keywords?: string[];
  illustrator?: string[];
  cost?: number;
  power?: number;
  ram?: number;
  /** La carte peut être jouée face cachée comme eddie (« sellable » chez la source). */
  eddiable?: boolean;
};

/** Carte accompagnée des images à recopier, le temps de l'import. */
type CardWithSources = { card: CyberpunkCard; images: { path: string; source: string; target: string }[] };

// --- Accès HTTP ----------------------------------------------------------

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * La source répond ponctuellement en 5xx sur les cent cinquante requêtes d'un
 * import : un échec isolé ne doit pas coûter le catalogue entier.
 */
async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const MAX_ATTEMPTS = 5;

  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${url}`);
    }

    return response;
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    return fetchWithRetry(url, attempt + 1);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  return (await fetchWithRetry(url)).json() as Promise<T>;
}

/** `map` à parallélisme borné : la source n'a pas à encaisser cent cinquante requêtes d'un coup. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));

  return results;
}

// --- Étape 1 : le catalogue ---------------------------------------------

/** Toutes les cartes de la liste, sans leurs impressions — la liste n'en rend aucune. */
async function fetchCardList(): Promise<ApiCard[]> {
  const cards = new Map<string, ApiCard>();
  let total = 0;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchJson<ApiPage>(`${API}?limit=${PAGE_SIZE}&offset=${offset}`);
    total = page.total;

    // Le catalogue peut bouger entre deux pages : la carte déjà vue n'est pas
    // dupliquée, la dernière lecture faisant foi.
    for (const card of page.items) {
      cards.set(card.slug, card);
    }

    if (page.items.length === 0 || offset + page.items.length >= total) {
      break;
    }
  }

  console.info(`${cards.size} cartes annoncées sur ${total}.`);

  return [...cards.values()];
}

/**
 * Les impressions d'une carte, lues sur sa fiche. Rend `undefined` si la fiche
 * ne répond pas : mieux vaut sauter une carte que d'en écrire une amputée de
 * ses variantes, qui effacerait celles déjà en base.
 */
async function fetchCardDetail(card: ApiCard): Promise<ApiCard | undefined> {
  try {
    return await fetchJson<ApiCard>(`${API}/${encodeURIComponent(card.slug)}`);
  } catch (error) {
    console.error(`« ${card.slug} » : fiche non récupérée (${reason(error)}), la carte est écartée.`);
    return undefined;
  }
}

// --- Transformation ------------------------------------------------------

/** Les listes vides ne sont pas écrites : elles n'apprendraient rien du document. */
function nonEmpty(values: (string | null | undefined)[]): string[] | undefined {
  const filtered = [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
  return filtered.length > 0 ? filtered : undefined;
}

function text(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

/** Extensions déjà signalées comme inconnues : une seule fois chacune, pas une par carte. */
const warnedSets = new Set<string>();

/**
 * Code d'extension de l'application. Une extension absente de `SET_CODES` en
 * reçoit un dérivé de son slug — l'import continue, mais il le dit : le code
 * d'une extension est figé dès la première carte écrite.
 */
function setCodeOf(set: ApiSet): string {
  const known = SET_CODES[set.code];

  if (known) {
    return known;
  }

  const derived = set.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_SET_CODE_LENGTH);

  if (!warnedSets.has(set.code)) {
    warnedSets.add(set.code);
    console.warn(
      `Extension inconnue « ${set.name} » (${set.code}) : ses cartes prennent le code ${derived}. ` +
        `Donnez-lui son code dans SET_CODES avant que ses cartes ne soient collectionnées.`
    );
  }

  return derived;
}

/**
 * Nom d'une variante : son extension et son numéro de collection. Le numéro
 * n'est pas décoratif — vingt-neuf cartes ont deux tirages dans une même
 * extension, que le seul nom d'extension ne distinguerait pas.
 */
function printingName(printing: ApiPrinting): string {
  const setName = printing.set?.name?.trim();
  const number = printing.collector_number?.trim();

  return [setName, number ? `(${number})` : undefined].filter(Boolean).join(" ") || printing.id;
}

/** Chemin d'une illustration sur le Blob : il ne dépend que de l'impression. */
function imagePath(printingId: string): string {
  return `${BLOB_PREFIX}/${printingId}.webp`;
}

/**
 * Une carte telle que l'application la collectionne, et les illustrations à
 * recopier pour elle. Rend `undefined` sur une carte que la source ne rattache
 * à aucune impression : sans impression, ni son extension ni son numéro ne
 * sont connus.
 */
function toCard(card: ApiCard): CardWithSources | undefined {
  const printings = card.printings ?? [];
  const base = printings.find((printing) => printing.id === card.printing_id);

  if (!base) {
    console.warn(`« ${card.slug} » : aucune impression de référence, elle est écartée.`);
    return undefined;
  }

  const set = base.set ?? card.set;
  const collectorNumber = text(base.collector_number) ?? text(card.print_number);

  if (!set || !collectorNumber) {
    console.warn(`« ${card.slug} » : sans extension ou sans numéro de collection, elle est écartée.`);
    return undefined;
  }

  const setCode = setCodeOf(set);
  const id = buildCardId(GAME, setCode, collectorNumber);

  if (!id) {
    console.warn(`« ${card.slug} » : identifiant vide (${setCode} / ${collectorNumber}), elle est écartée.`);
    return undefined;
  }

  // Les variantes sont rangées par extension puis par numéro : deux imports
  // successifs doivent produire la même liste, dans le même ordre.
  const variants = withUniquePrintingIds(
    printings
      .filter((printing) => printing.id !== base.id)
      .sort((a, b) =>
        (a.set?.code ?? "").localeCompare(b.set?.code ?? "") ||
        (a.collector_number ?? "").localeCompare(b.collector_number ?? "") ||
        a.id.localeCompare(b.id)
      )
      .map((printing) => ({ id: printing.id, name: printingName(printing), image: printing.image_url ?? undefined }))
  );

  const images = [
    { path: imagePath(base.id), source: base.image_url ?? card.image_url, target: "" },
    ...variants.map((variant) => ({ path: imagePath(variant.id), source: variant.image ?? null, target: variant.id })),
  ].flatMap((image) => (image.source ? [{ ...image, source: image.source }] : []));

  return {
    card: {
      id,
      name: card.name,
      setCode,
      collectorNumber,
      lang: LANGUAGE,
      // Les URL des illustrations sont réécrites après leur recopie sur le
      // Blob : celles de la source expirent en vingt-quatre heures.
      text: text(card.rules_text),
      // Le plafond de variantes n'est pas appliqué ici : il l'est à l'écriture,
      // qui seule connaît aussi celles saisies à la main.
      printings: variants.length > 0 ? variants : undefined,
      setName: set.name,
      type: text(card.card_type),
      // Rareté et illustrateur varient d'un tirage à l'autre : ceux de la carte
      // sont ceux de son impression de référence.
      rarity: text(base.rarity) ?? text(card.rarity),
      color: text(card.color),
      tags: nonEmpty(card.classifications ?? []),
      keywords: nonEmpty(card.keywords ?? []),
      illustrator: nonEmpty([base.artist ?? card.artist]),
      cost: card.cost ?? undefined,
      power: card.power ?? undefined,
      ram: card.ram ?? undefined,
      eddiable: card.is_eddiable ?? undefined,
    },
    images,
  };
}

/**
 * Deux cartes de même identifiant se partageraient un document : la seconde
 * effacerait la première sans que rien ne le signale. Comme l'identifiant est
 * figé après création, on s'arrête avant d'écrire.
 */
function assertUniqueIds(cards: CyberpunkCard[]): void {
  const byId = new Map<string, string[]>();
  for (const card of cards) {
    byId.set(card.id, [...(byId.get(card.id) ?? []), card.name]);
  }

  const collisions = [...byId].filter(([, names]) => names.length > 1);
  if (collisions.length > 0) {
    throw new Error(
      `Identifiants en double : ${collisions
        .map(([id, names]) => `${id} (${names.join(", ")})`)
        .join(" ; ")}. Départagez les codes d'extension avant d'importer.`
    );
  }
}

// --- Illustrations -------------------------------------------------------

/** Les illustrations déjà recopiées, par chemin : une seconde exécution n'en renvoie aucune. */
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
 * Recopie sur le Blob les illustrations qui n'y sont pas encore, et réécrit les
 * cartes avec les URL du Blob.
 *
 * Une image que la source n'a pas rendue laisse la carte — ou la variante —
 * sans illustration plutôt que de la faire pointer sur un lien mort.
 */
async function mirrorImages(entries: CardWithSources[], refresh: boolean): Promise<CyberpunkCard[]> {
  const existing = await listUploadedImages();
  const urls = new Map<string, string>();
  let uploaded = 0;
  let reused = 0;
  let failed = 0;

  // Par chemin : deux cartes ne partagent jamais une impression, mais rien ne
  // sert de télécharger deux fois ce qui aboutirait au même fichier.
  const all = [...new Map(entries.flatMap((entry) => entry.images).map((image) => [image.path, image])).values()];

  await mapWithConcurrency(all, CONCURRENCY, async (image) => {
    const known = existing.get(image.path);

    if (known && !refresh) {
      urls.set(image.path, known);
      reused += 1;
      return;
    }

    try {
      const response = await fetchWithRetry(image.source);
      const blob = await put(image.path, Buffer.from(await response.arrayBuffer()), {
        access: "public",
        contentType: response.headers.get("content-type") ?? "image/webp",
        // Le chemin est celui que l'import a calculé, et il doit rester le même
        // d'un passage à l'autre : ni suffixe aléatoire, ni refus d'écraser.
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      urls.set(image.path, blob.url);
      uploaded += 1;
    } catch (error) {
      // L'illustration manquera, mais la carte, elle, sera bien écrite.
      console.error(`Illustration non recopiée (${image.path}) : ${reason(error)}`);
      if (known) {
        urls.set(image.path, known);
      }
      failed += 1;
    }
  });

  console.info(
    `Illustrations : ${uploaded} recopiées sur le Blob, ${reused} déjà en place` +
      (failed > 0 ? `, ${failed} en échec` : "") +
      "."
  );

  return entries.map(({ card, images }) => {
    const base = images.find((image) => image.target === "");
    // `image` est laissé absent plutôt qu'`undefined` : c'est une variante
    // écrite telle quelle dans un tableau, où le pilote Mongo garderait un
    // `null` que `cardPrintingSchema` refuse.
    const printings = card.printings?.map(({ image: _source, ...printing }) => {
      const url = urls.get(images.find((candidate) => candidate.target === printing.id)?.path ?? "");
      return url ? { ...printing, image: url } : printing;
    });

    return {
      ...card,
      image: base ? urls.get(base.path) : undefined,
      ...(printings ? { printings } : {}),
    };
  });
}

// --- Téléchargement complet ---------------------------------------------

async function fetchCatalog(refreshImages: boolean): Promise<CyberpunkCard[]> {
  const catalog = await fetchCardList();

  console.info(`Fiches des ${catalog.length} cartes (les impressions n'existent que là)...`);
  const details = await mapWithConcurrency(catalog, CONCURRENCY, fetchCardDetail);

  const entries = details.flatMap((card) => {
    const converted = card ? toCard(card) : undefined;
    return converted ? [converted] : [];
  });

  console.info(
    `${entries.length} cartes retenues, ${entries.reduce((total, entry) => total + entry.images.length, 0)} illustrations.`
  );

  const cards = await mirrorImages(entries, refreshImages);

  return cards.sort((a, b) => a.id.localeCompare(b.id));
}

// --- Écriture ------------------------------------------------------------

/** Le jeu doit exister en base : le script ne crée pas de jeu. */
async function resolveGameId(): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug: GAME_SLUG }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(
      `Aucun jeu avec le slug « ${GAME_SLUG} » : créez-le depuis l'administration, ou passez CYBERPUNK_GAME_SLUG.`
    );
  }

  return game._id;
}

/**
 * Variantes déjà enregistrées que l'import ne connaît pas, par identifiant de
 * carte.
 *
 * Les variantes de Cyberpunk viennent de la source, qui publie tous les tirages
 * d'une carte : l'import les réécrit donc. Mais une variante peut aussi avoir
 * été saisie depuis l'administration, et celle-là n'existe nulle part chez la
 * source — la réécriture la perdrait, en base comme dans l'index.
 */
async function readExtraPrintings(cards: CyberpunkCard[], gameId: ObjectId): Promise<Map<string, CardPrinting[]>> {
  const imported = new Map(
    cards.map((card) => [card.id, new Set((card.printings ?? []).map((printing) => printing.id))])
  );

  const docs = await db
    .collection("cards")
    .find({ gameId, id: { $in: cards.map((card) => card.id) } }, { projection: { _id: 0, id: 1, printings: 1 } })
    .toArray();

  return new Map(
    docs.flatMap((doc) => {
      const kept = (Array.isArray(doc.printings) ? (doc.printings as CardPrinting[]) : []).filter(
        (printing) => !imported.get(doc.id)?.has(printing.id)
      );

      return kept.length > 0 ? [[doc.id as string, kept] as const] : [];
    })
  );
}

/**
 * Variantes d'une carte, dans la limite que l'application accepte.
 *
 * Au-delà, ce sont les variantes saisies à la main qui sont gardées : elles
 * n'existent nulle part ailleurs, alors qu'un import suffit à retrouver celles
 * de la source. Le plafond n'est jamais atteint aujourd'hui — cinq variantes au
 * plus par carte —, mais une carte qui le franchirait perdrait des tirages en
 * silence, et c'est ici que ça se voit.
 */
function limitPrintings(id: string, imported: CardPrinting[], manual: CardPrinting[]): CardPrinting[] {
  const total = imported.length + manual.length;

  if (total <= MAX_CARD_PRINTINGS) {
    return [...imported, ...manual];
  }

  const kept = [
    ...imported.slice(0, Math.max(0, MAX_CARD_PRINTINGS - manual.length)),
    ...manual.slice(0, MAX_CARD_PRINTINGS),
  ];

  console.warn(
    `${id} : ${total} variantes (${imported.length} importées, ${manual.length} saisies à la main), ` +
      `les ${kept.length} premières sont conservées — l'application en accepte ${MAX_CARD_PRINTINGS}.`
  );

  return kept;
}

async function writeCards(cards: CyberpunkCard[]): Promise<void> {
  const gameId = await resolveGameId();
  const extraPrintings = await readExtraPrintings(cards, gameId);

  if (extraPrintings.size > 0) {
    console.info(`${extraPrintings.size} cartes portent des variantes saisies à la main, elles sont conservées.`);
  }

  const complete = cards.map((card) => {
    const printings = limitPrintings(card.id, card.printings ?? [], extraPrintings.get(card.id) ?? []);

    return { ...card, ...(printings.length > 0 ? { printings } : {}) };
  });

  console.info(`Écriture de ${complete.length} cartes pour le jeu « ${GAME_SLUG} » (${gameId})...`);

  const BATCH = 500;
  for (let index = 0; index < complete.length; index += BATCH) {
    const batch = complete.slice(index, index + BATCH);

    await db.collection("cards").bulkWrite(
      batch.map((card) => {
        // Une propriété absente de la source (une carte sans coût, sans
        // puissance…) ne doit pas être écrite en `null` sur le document
        // existant.
        const fields = Object.fromEntries(Object.entries(card).filter(([, value]) => value !== undefined));

        return {
          updateOne: {
            filter: { id: card.id, gameId },
            update: {
              $set: { ...fields, gameId },
              // Distingue les cartes importées de celles ajoutées à la main
              // depuis l'administration (`source: 'manual'`).
              $setOnInsert: { source: "import" },
            },
            upsert: true,
          },
        };
      })
    );

    console.info(`Base : ${Math.min(index + BATCH, complete.length)}/${complete.length}`);
  }

  await writeSearchIndex(complete, gameId);
}

/**
 * Pousse les cartes dans l'index de recherche, en le créant au besoin.
 *
 * L'index n'est **pas** vidé : il porte aussi les cartes ajoutées à la main
 * depuis l'administration, que la source ne republiera jamais.
 *
 * Ses réglages sont posés au passage, d'après les attributs que portent
 * réellement les cartes du jeu — c'est ce que fait « Mettre à jour l'index » de
 * l'administration, et sans quoi Meilisearch refuse les filtres et les tris de
 * la galerie (cf. docs/CARD_EXPLORER_FILTERS.md). Ils sont relus de la base,
 * qui vient d'être écrite : un premier import laisse donc un index utilisable
 * sans autre geste.
 */
async function writeSearchIndex(cards: CyberpunkCard[], gameId: ObjectId): Promise<void> {
  const indexConfig = indexes[GAME];

  await ensureCardIndex(indexConfig.name);

  const facets = await getGameCardFilterFacets(gameId);
  await meilisearch.index(indexConfig.name).updateSettings(
    cardIndexSettings(indexConfig, {
      facetKeys: facets.map((facet) => facet.key),
      numericKeys: facets.flatMap((facet) => (facet.type === "number" ? [facet.key] : [])),
    })
  );
  console.info(`Index « ${indexConfig.name} » réglé sur ${facets.length} attributs.`);

  const index = meilisearch.index(indexConfig.name);
  for (let offset = 0; offset < cards.length; offset += 1000) {
    await index.addDocuments(cards.slice(offset, offset + 1000).map((card) => importedCardSearchDocument(card)));
    console.info(`Index : ${Math.min(offset + 1000, cards.length)}/${cards.length}`);
  }
}

// --- Entrée --------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fromFile = args.includes("--from-file");
  const fetchOnly = args.includes("--fetch-only");
  const refreshImages = args.includes("--refresh-images");

  const cards: CyberpunkCard[] = fromFile
    ? JSON.parse(await readFile(CARDS_FILE, "utf-8"))
    : await fetchCatalog(refreshImages);

  if (!fromFile) {
    await writeFile(CARDS_FILE, JSON.stringify(cards, null, 2));
    console.info(`${cards.length} cartes écrites dans ${CARDS_FILE}.`);
  }

  // Après `cards.json`, et non avant : une collision d'identifiants se répare
  // en choisissant des codes d'extension, et c'est le fichier qui montre
  // lesquels. S'arrêter avant de l'écrire emporterait la seule pièce du
  // diagnostic — et le téléchargement entier avec elle. La garantie tient : la
  // vérification reste avant toute écriture en base.
  assertUniqueIds(cards);

  if (fetchOnly) {
    return;
  }

  if (cards.length === 0) {
    throw new Error("Catalogue vide : rien n'est écrit en base.");
  }

  await writeCards(cards);
  console.info("Import terminé.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
