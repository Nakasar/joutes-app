/**
 * Import du catalogue Flesh and Blood depuis Card Vault
 * (https://cardvault.fabtcg.com, API https://api.cardvault.fabtcg.com).
 *
 * L'API n'expose aucune route « toutes les cartes » : la racine
 * `/carddb/api/v1/` ne liste que les référentiels (classes, talents, types,
 * sous-types, produits, coûts). Le catalogue se parcourt donc par les produits :
 *
 *   1. `product-groups-products/` donne les groupes de produits et, dans chaque
 *      groupe, une déclinaison par langue ;
 *   2. `product-cards/<slug>/` donne les cartes d'un produit, dont leur
 *      `card_id` (l'identifiant slug de la carte, `arakni`, `savage-swing-1`…) ;
 *   3. `card_id/<card_id>/` donne la carte complète — toutes ses impressions,
 *      toutes langues et toutes extensions confondues.
 *
 * Comme l'étape 3 renvoie *toutes* les impressions d'une carte, les produits ne
 * servent qu'à énumérer les `card_id` : chaque carte n'est donc téléchargée
 * qu'une fois, quel que soit le nombre de produits qui la contiennent (≈ 4 900
 * cartes pour ≈ 10 500 entrées de produits).
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/fab/import-cards.ts [--fetch-only|--from-file]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - sans option : télécharge le catalogue, l'écrit dans `cards.json`, puis le
 *   pousse en base et dans l'index de recherche ;
 * - `--fetch-only` : télécharge seulement (utile pour relire le résultat avant
 *   d'écrire quoi que ce soit) ;
 * - `--from-file` : réécrit en base depuis `cards.json`, sans retélécharger.
 *
 * Variables d'environnement : `MONGODB_URI`, `MEILISEARCH_ENDPOINT`,
 * `MEILISEARCH_API_KEY`, et `FAB_GAME_SLUG` si le jeu n'a pas le slug `fab`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import db from "../../../lib/mongodb.ts";
import meilisearch, { indexes } from "../../../lib/meilisearch.ts";
import { withUniquePrintingIds } from "../../../lib/constants/card-ids.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API = "https://api.cardvault.fabtcg.com/carddb/api/v1";

/** Slug du jeu en base. Surchargeable si le jeu a été créé sous un autre slug. */
const GAME_SLUG = process.env.FAB_GAME_SLUG ?? "fab";

/** Seule la langue anglaise est importée : c'est l'édition de référence. */
const LANGUAGE = "en";

/** Requêtes simultanées vers Card Vault — l'API n'est pas documentée, on reste modeste. */
const CONCURRENCY = 8;

const CARDS_FILE = path.join(__dirname, "cards.json");

// --- Types de l'API ------------------------------------------------------

type ApiProduct = {
  id: string;
  slug: string;
  product_name: string;
  product_type: string;
  printed_language: string;
  release_date: string | null;
};

type ApiProductGroup = {
  id: string;
  group_name: string;
  products: ApiProduct[];
};

type ApiImage = { small: string; normal: string; large: string };

type ApiFace = {
  face_id: string;
  art_type: string;
  finish_type: string;
  printed_artist: string;
  printed_name: string;
  printed_code: string;
  layout_position: number;
  image: ApiImage | null;
};

type ApiPrint = {
  print_id: string;
  print_language: string;
  set_number: number;
  rarity: string;
  layout: string;
  is_default: boolean;
  faces: ApiFace[];
  print_set: { set_code: string; set_name: string };
  product: { product_name: string; slug: string };
};

type ApiNamedValue = { name_en: string };

type ApiCore = {
  name: string;
  layout_position: number;
  color: string;
  textbox: string;
  typebox: string;
  traitbox: string;
  pitch_value: number | null;
  cost_value: number | null;
  power_value: number | null;
  defense_value: number | null;
  intellect_value: number | null;
  life_value: number | null;
  core_classes: ApiNamedValue[];
  core_talents: ApiNamedValue[];
  core_types: ApiNamedValue[];
  core_subtypes: ApiNamedValue[];
};

type ApiCard = {
  card_id: string;
  object_type: string;
  card_type: string;
  cores: ApiCore[];
  card_prints: ApiPrint[];
  card_legality: Record<string, { legality: string }>;
};

// --- Carte telle qu'on la stocke ----------------------------------------

type Printing = { id: string; name: string; foil?: boolean; image?: string };

/**
 * Une carte du catalogue = une impression au sens collection : une extension et
 * un numéro. Les tirages d'un même numéro (foil arc-en-ciel, cold foil, art
 * étendu, réédition Unlimited…) sont des `printings`, conformément au modèle de
 * l'application — cf. docs/CARD_PRINTINGS.md.
 */
export type FabCard = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  lang: string;
  image?: string;
  text?: string;
  foil?: boolean;
  printings?: Printing[];
  // Attributs de jeu, écrits à la racine du document comme pour les autres jeux.
  fabId: string;
  /** Code de l'impression de référence chez Card Vault (`WTR020`, `U-WTR020`…). */
  printId: string;
  setName?: string;
  type?: string;
  types?: string[];
  subTypes?: string[];
  classes?: string[];
  talents?: string[];
  rarity?: string;
  color?: string;
  typeLine?: string;
  traits?: string[];
  artist?: string;
  objectType?: string;
  token?: boolean;
  formats?: string[];
  backImage?: string;
  pitch?: number;
  cost?: number;
  power?: number;
  defense?: number;
  intellect?: number;
  life?: number;
};

// --- Accès HTTP ----------------------------------------------------------

/**
 * Card Vault renvoie ponctuellement des 429/5xx sur un import complet
 * (≈ 5 000 requêtes) : un échec isolé ne doit pas perdre la carte, on retente
 * avec une attente croissante avant d'abandonner.
 */
async function fetchJson<T>(url: string, attempt = 1): Promise<T> {
  const MAX_ATTEMPTS = 5;

  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${url}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    return fetchJson<T>(url, attempt + 1);
  }
}

/** Exécute `task` sur chaque élément, `CONCURRENCY` à la fois. */
async function mapWithConcurrency<T, R>(items: T[], task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

  return results;
}

// --- Étape 1 : les produits ---------------------------------------------

async function fetchProductGroups(): Promise<ApiProductGroup[]> {
  const groups: ApiProductGroup[] = [];
  let url: string | null = `${API}/product-groups-products/?page_size=150`;

  while (url) {
    const page: { results: ApiProductGroup[]; next: string | null } = await fetchJson(url);
    groups.push(...page.results);
    url = page.next;
  }

  return groups;
}

const LANGUAGE_TAG = /\s\[(EN|FR|DE|IT|ES|JA)\]$/i;

/**
 * Produit anglais d'un groupe.
 *
 * `printed_language` n'est pas fiable — le groupe « Mastery Pack Assassin »
 * annonce `fr` sur sa déclinaison japonaise et `ja` sur la française —, alors
 * que le nom porte systématiquement le suffixe de langue (`… [FR]`) sauf sur
 * l'édition anglaise. C'est donc le nom qui tranche.
 *
 * Quelques groupes n'existent qu'en japonais ou qu'en langues européennes : on
 * y prend alors le premier produit. Ses cartes seront tout de même importées en
 * anglais, puisque c'est la fiche carte — et non le produit — qui fournit les
 * impressions.
 */
function englishProduct(group: ApiProductGroup): ApiProduct | undefined {
  return group.products.find((product) => !LANGUAGE_TAG.test(product.product_name.trim())) ?? group.products[0];
}

async function fetchProductCardIds(slug: string): Promise<string[]> {
  const product = await fetchJson<{ cards: { card_id: string }[] }>(`${API}/product-cards/${slug}/`);

  return product.cards.map((card) => card.card_id);
}

// --- Étape 3 : les cartes ------------------------------------------------

async function fetchCard(cardId: string): Promise<ApiCard | undefined> {
  const response = await fetchJson<{ results: ApiCard[] }>(`${API}/card_id/${encodeURIComponent(cardId)}/`);

  return response.results[0];
}

// --- Transformation ------------------------------------------------------

const ART_LABELS: Record<string, string> = {
  "extended-art": "Extended Art",
  "full-art": "Full Art",
  "alternate-art": "Alternate Art",
};

const FINISH_LABELS: Record<string, string> = {
  "rainbow-foil": "Rainbow Foil",
  "cold-foil": "Cold Foil",
  "gold-foil": "Gold Foil",
};

function isFoil(print: ApiPrint): boolean {
  return print.faces.some((face) => face.finish_type && face.finish_type !== "regular");
}

/** Face principale d'une impression (`layout_position` 10 = recto). */
function frontFace(print: ApiPrint): ApiFace | undefined {
  return [...print.faces].sort((a, b) => a.layout_position - b.layout_position)[0];
}

function imageOf(face: ApiFace | undefined): string | undefined {
  return face?.image?.large || face?.image?.normal || undefined;
}

/**
 * Impression de référence du numéro : celle que l'API marque par défaut, sinon
 * la version la plus « nue » (art normal, sans foil). C'est elle qui donne le
 * nom, l'illustration et la rareté de la carte ; les autres deviennent des
 * variantes.
 */
function sortPrints(prints: ApiPrint[]): ApiPrint[] {
  const rank = (print: ApiPrint) => {
    const face = frontFace(print);
    return [
      print.is_default ? 0 : 1,
      face?.finish_type === "regular" ? 0 : 1,
      face?.art_type === "regular" ? 0 : 1,
      print.print_id.length,
    ];
  };

  return [...prints].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) {
        return ra[i] - rb[i];
      }
    }
    return a.print_id.localeCompare(b.print_id);
  });
}

/**
 * Libellé d'une variante : ce qui la distingue de l'impression de référence —
 * son tirage (foil), son illustration (art étendu, pleine illustration) et, si
 * le numéro a été réimprimé dans un autre produit (rééditions « Unlimited »,
 * decks de démarrage…), le produit dont elle vient.
 */
function printingName(print: ApiPrint, { withProduct }: { withProduct: boolean }): string {
  const face = frontFace(print);

  const parts = [
    withProduct ? print.product.product_name : undefined,
    face && ART_LABELS[face.art_type],
    face && FINISH_LABELS[face.finish_type],
  ].filter((part): part is string => Boolean(part));

  // Sans rien pour la distinguer, le code d'impression reste le libellé le plus
  // parlant (`WTR020-TP`) — mieux vaut ça qu'une variante « Regular » de plus.
  const name = parts.length > 0 ? parts.join(" — ") : print.print_id;

  return name.length > 100 ? `${name.slice(0, 97)}…` : name;
}

function printingIdOf(print: ApiPrint): string {
  return print.print_id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Les listes vides ne sont pas écrites : elles n'apprendraient rien du document. */
function nonEmpty(values: string[]): string[] | undefined {
  const filtered = values.filter(Boolean);
  return filtered.length > 0 ? filtered : undefined;
}

function coreFields(cores: ApiCore[]) {
  const ordered = [...cores].sort((a, b) => a.layout_position - b.layout_position);
  const [primary] = ordered;

  if (!primary) {
    return undefined;
  }

  // Une carte à deux faces jouables porte deux « cores » : les deux faces sont
  // conservées, séparées comme le veut l'usage (`Recto // Verso`).
  const names = ordered.map((core) => core.name).filter(Boolean);
  // `{br}` est le saut de ligne de Card Vault ; les autres accolades ({r}, {h}…)
  // sont la notation des symboles du jeu et sont conservées telles quelles.
  const texts = ordered.map((core) => core.textbox.replaceAll("{br}", "\n")).filter(Boolean);

  return {
    name: names.join(" // ") || primary.name,
    text: texts.join("\n//\n") || undefined,
    typeLine: primary.typebox || undefined,
    color: primary.color || undefined,
    type: primary.core_types[0]?.name_en,
    types: nonEmpty(ordered.flatMap((core) => core.core_types.map((value) => value.name_en))),
    subTypes: nonEmpty(ordered.flatMap((core) => core.core_subtypes.map((value) => value.name_en))),
    classes: nonEmpty(ordered.flatMap((core) => core.core_classes.map((value) => value.name_en))),
    talents: nonEmpty(ordered.flatMap((core) => core.core_talents.map((value) => value.name_en))),
    traits: nonEmpty(primary.traitbox.split(",").map((trait) => trait.trim())),
    pitch: primary.pitch_value ?? undefined,
    cost: primary.cost_value ?? undefined,
    power: primary.power_value ?? undefined,
    defense: primary.defense_value ?? undefined,
    intellect: primary.intellect_value ?? undefined,
    life: primary.life_value ?? undefined,
  };
}

/** Formats dans lesquels la carte est légale (`Blitz`, `Classic Constructed`…). */
function legalFormats(legality: Record<string, { legality: string }>): string[] | undefined {
  return nonEmpty(
    Object.entries(legality)
      .filter(([, value]) => value.legality === "legal")
      .map(([format]) => format)
  );
}

/**
 * Une fiche carte donne toutes ses impressions ; on en tire une carte par
 * couple (extension, numéro) — l'unité de collection de l'application, cf.
 * docs/CARD_PRINTINGS.md — les tirages d'un même numéro devenant des variantes.
 */
function toCards(card: ApiCard): FabCard[] {
  const core = coreFields(card.cores);

  if (!core) {
    console.warn(`Carte sans « core » ignorée : ${card.card_id}`);
    return [];
  }

  const prints = card.card_prints.filter((print) => print.print_language === LANGUAGE);

  const byNumber = new Map<string, ApiPrint[]>();
  for (const print of prints) {
    const key = `${print.print_set.set_code}${String(print.set_number).padStart(3, "0")}`;
    byNumber.set(key, [...(byNumber.get(key) ?? []), print]);
  }

  return [...byNumber.entries()].map(([id, group]) => {
    const [base, ...variants] = sortPrints(group);
    const face = frontFace(base);
    const back = base.faces.find((other) => other.layout_position > (face?.layout_position ?? 0));

    // Un numéro réimprimé dans plusieurs produits (« Welcome to Rathe » et sa
    // réédition « Unlimited ») a besoin du produit pour distinguer ses variantes.
    const products = new Set(group.map((print) => print.product.product_name));

    const named = variants.map((print) => ({
      print,
      name: printingName(print, { withProduct: products.size > 1 }),
    }));

    // Deux tirages peuvent ne différer que par leur illustration (`-MV` et
    // `-MVA` de Rosetta) : rien ne les distingue alors dans leur libellé, et
    // c'est leur code d'impression qui les départage.
    const ambiguous = new Set(
      named.filter((entry, index) => named.some((other, otherIndex) => other.name === entry.name && otherIndex !== index))
        .map((entry) => entry.name)
    );

    const printings = withUniquePrintingIds(
      named.map(({ print, name }) => ({
        id: printingIdOf(print),
        name: ambiguous.has(name) ? `${name} (${print.print_id})` : name,
        foil: isFoil(print) || undefined,
        image: imageOf(frontFace(print)),
      }))
    );

    if (printings.length > 30) {
      console.warn(`${id} : ${printings.length} variantes, les 30 premières sont conservées.`);
    }

    return {
      id,
      name: face?.printed_name || core.name,
      setCode: base.print_set.set_code,
      collectorNumber: String(base.set_number).padStart(3, "0"),
      lang: LANGUAGE,
      image: imageOf(face),
      backImage: imageOf(back),
      text: core.text,
      // La carte n'existe qu'en foil quand aucun de ses tirages n'est normal.
      foil: group.every(isFoil) || undefined,
      printings: printings.length > 0 ? printings.slice(0, 30) : undefined,
      fabId: card.card_id,
      printId: base.print_id,
      setName: base.print_set.set_name || undefined,
      rarity: base.rarity || undefined,
      artist: face?.printed_artist || undefined,
      objectType: card.object_type || undefined,
      token: card.object_type === "token" || undefined,
      formats: legalFormats(card.card_legality),
      type: core.type,
      types: core.types,
      subTypes: core.subTypes,
      classes: core.classes,
      talents: core.talents,
      traits: core.traits,
      typeLine: core.typeLine,
      color: core.color,
      pitch: core.pitch,
      cost: core.cost,
      power: core.power,
      defense: core.defense,
      intellect: core.intellect,
      life: core.life,
    };
  });
}

// --- Téléchargement complet ---------------------------------------------

async function fetchCatalog(): Promise<FabCard[]> {
  console.info("Récupération des groupes de produits...");
  const groups = await fetchProductGroups();
  console.info(`${groups.length} groupes de produits.`);

  const products = groups.flatMap((group) => englishProduct(group) ?? []);

  const cardIdLists = await mapWithConcurrency(products, async (product, index) => {
    if (index % 20 === 0) {
      console.info(`Produits : ${index}/${products.length}...`);
    }
    return fetchProductCardIds(product.slug);
  });

  const cardIds = [...new Set(cardIdLists.flat())].sort();
  console.info(`${cardIds.length} cartes distinctes à récupérer.`);

  const cards = await mapWithConcurrency(cardIds, async (cardId, index) => {
    if (index % 250 === 0) {
      console.info(`Cartes : ${index}/${cardIds.length}...`);
    }
    const card = await fetchCard(cardId);
    return card ? toCards(card) : [];
  });

  // Quelques numéros des extensions promotionnelles (LGS, HER, XXX) sont
  // partagés par deux cartes différentes chez Card Vault : `LGS229-A` (Gold) et
  // `LGS229-RF` (Agility) annoncent tous deux le numéro 229. Plutôt que de
  // perdre la seconde, elle est renumérotée sur son code d'impression, qui lui
  // est propre — la carte reste dans le catalogue et gardera son identifiant
  // d'un import à l'autre.
  const byId = new Map<string, FabCard>();
  let renumbered = 0;
  let dropped = 0;

  for (const card of cards.flat()) {
    const taken = byId.get(card.id);

    if (!taken) {
      byId.set(card.id, card);
      continue;
    }

    const suffix = card.printId.startsWith(card.setCode)
      ? card.printId.slice(card.setCode.length)
      : card.printId;

    if (byId.has(card.printId)) {
      dropped++;
      console.warn(`${card.id} : « ${card.fabId} » écartée, son code ${card.printId} est lui aussi déjà pris.`);
      continue;
    }

    renumbered++;
    console.warn(`${card.id} : numéro déjà pris par « ${taken.fabId} », « ${card.fabId} » devient ${card.printId}.`);
    byId.set(card.printId, { ...card, id: card.printId, collectorNumber: suffix });
  }

  if (renumbered > 0 || dropped > 0) {
    console.warn(`${renumbered} cartes renumérotées, ${dropped} écartées.`);
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// --- Écriture ------------------------------------------------------------

/** Le jeu doit exister en base : le script ne crée pas de jeu. */
async function resolveGameId(): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug: GAME_SLUG }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(
      `Aucun jeu avec le slug « ${GAME_SLUG} » : créez-le depuis l'administration, ou passez FAB_GAME_SLUG.`
    );
  }

  return game._id;
}

function searchDocument(card: FabCard): Record<string, unknown> {
  // `*` n'est pas accepté dans un identifiant Meilisearch, comme pour les
  // autres jeux ; `cardId` garde l'identifiant réel de la carte.
  return { ...card, id: card.id.replaceAll("*", "s"), cardId: card.id };
}

async function writeCards(cards: FabCard[]): Promise<void> {
  const gameId = await resolveGameId();

  console.info(`Écriture de ${cards.length} cartes pour le jeu « ${GAME_SLUG} » (${gameId})...`);

  const BATCH = 500;
  for (let index = 0; index < cards.length; index += BATCH) {
    const batch = cards.slice(index, index + BATCH);

    await db.collection("cards").bulkWrite(
      batch.map((card) => {
        // Une propriété absente de la source (une carte sans coût, sans talent…)
        // ne doit pas être écrite en `null` sur le document existant.
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

    console.info(`Base : ${Math.min(index + BATCH, cards.length)}/${cards.length}`);
  }

  const index = meilisearch.index(indexes.fab.name);
  for (let offset = 0; offset < cards.length; offset += 1000) {
    await index.addDocuments(cards.slice(offset, offset + 1000).map(searchDocument));
    console.info(`Index : ${Math.min(offset + 1000, cards.length)}/${cards.length}`);
  }
}

// --- Entrée --------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fromFile = args.includes("--from-file");
  const fetchOnly = args.includes("--fetch-only");

  const cards: FabCard[] = fromFile
    ? JSON.parse(await readFile(CARDS_FILE, "utf-8"))
    : await fetchCatalog();

  if (!fromFile) {
    await writeFile(CARDS_FILE, JSON.stringify(cards, null, 2));
    console.info(`${cards.length} cartes écrites dans ${CARDS_FILE}.`);
  }

  if (fetchOnly) {
    return;
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
