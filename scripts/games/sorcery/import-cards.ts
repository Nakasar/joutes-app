/**
 * Import du catalogue Sorcery: Contested Realm depuis sorcerycard.io
 * (https://sorcerycard.io/card-database, API https://sorcerycard.io/api/cards/database).
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/sorcery/import-cards.ts [--fetch-only|--from-file]
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
 * `MEILISEARCH_API_KEY`, et `SORCERY_GAME_SLUG` si le jeu n'a pas le slug
 * `sorcery` (il porte l'identifiant 6a953266041ab9a9a245317f en production).
 *
 * Après le premier import, les filtres de la galerie demandent que l'index
 * déclare les attributs du jeu : c'est le bouton « Mettre à jour l'index » de
 * l'administration des cartes, cf. docs/CARD_EXPLORER_FILTERS.md.
 *
 * ## Sorcery n'imprime ni code d'extension ni numéro de collection
 *
 * Les cartes du jeu ne portent aucun numéro : ni la source, ni les cartes
 * elles-mêmes n'en ont. L'application, elle, identifie une carte par son
 * extension et son numéro (cf. `lib/constants/card-ids.ts`) — les deux sont
 * donc reconstitués, et rien d'autre ne peut ensuite les changer sans casser
 * les collections déjà saisies :
 *
 * - **le code d'extension** est celui que la source donne à ses impressions
 *   (`set_code`), mis en majuscules : `ALP` (Alpha), `BET` (Beta), `ART`
 *   (Arthurian Legends), `DRA` (Dragonlord), `GOT` (Gothic), `PRO`
 *   (Promotional). Il n'est pas figé ici : une extension nouvelle apporte le
 *   sien avec ses cartes ;
 * - **le numéro de collection** est le slug de la carte chez la source
 *   (`abaddon-succubus`). C'est le seul identifiant stable et unique au sein
 *   d'une extension qu'elle publie — l'entier qui préfixe ses slugs
 *   d'impression (`006-abaddon_succubus-b-s`) numérote l'extension, pas la
 *   carte. L'identifiant vaut donc `GOT-abaddon-succubus`, ce que reconstruit
 *   aussi le formulaire d'administration (`sorcery` sépare par un tiret).
 *
 * Une même carte publiée dans deux extensions (Alpha et Beta rejouent le même
 * catalogue) donne bien deux cartes, `ALP-abundance` et `BET-abundance` : ce
 * sont deux cartes à collectionner distinctes, comme partout ailleurs dans
 * l'application.
 *
 * ## Ce qui est écarté de la source
 *
 * - `life` : toujours 20 quand elle est renseignée, y compris sur des minions
 *   qui n'ont pas de total de vie — c'est celui des avatars, recopié. Une
 *   valeur constante ne filtrerait rien et tromperait là où elle est fausse ;
 * - `tcgplayer_id` : identique pour Alpha et Beta, il ne désigne donc pas
 *   l'impression et ne servirait pas à rapprocher un prix.
 */
import { readFile, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import { parse } from "node-html-parser";
import db from "../../../lib/mongodb.ts";
import meilisearch, { indexes } from "../../../lib/meilisearch.ts";
import { importedCardSearchDocument } from "../../../lib/cards/import-search.ts";
import { buildCardId, withUniquePrintingIds } from "../../../lib/constants/card-ids.ts";
import { MAX_CARD_PRINTINGS } from "../../../lib/schemas/card.schema.ts";
import type { CardPrinting } from "../../../lib/types/card.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITE = "https://sorcerycard.io";
const DATABASE_API = `${SITE}/api/cards/database`;
const DATABASE_PAGE = `${SITE}/card-database`;

/** Convention d'identifiant du jeu, indépendante du slug qu'il porte en base. */
const GAME = "sorcery";

/** Slug du jeu en base. Surchargeable si le jeu a été créé sous un autre slug. */
const GAME_SLUG = process.env.SORCERY_GAME_SLUG ?? GAME;

/** Le catalogue n'est publié qu'en anglais. */
const LANGUAGE = "en";

/**
 * Extensions connues au moment de l'écriture du script. Elles sont réunies à
 * celles que déclare la page du catalogue : la liste de la page fait foi — une
 * extension nouvelle est importée sans toucher au script —, celle-ci garantit
 * qu'un changement de mise en page ne fasse pas silencieusement disparaître
 * tout un pan du catalogue.
 */
const KNOWN_SET_NAMES = ["Alpha", "Beta", "Arthurian Legends", "Dragonlord", "Gothic", "Promotional"];

const CARDS_FILE = path.join(__dirname, "cards.json");

// --- Types de l'API ------------------------------------------------------

/**
 * Une impression : un tirage précis d'une carte dans une extension (normal,
 * foil, box topper…). La liste n'est renseignée que sur une requête filtrée
 * par extension — sans filtre, l'API répond `printings: null`.
 */
type ApiPrinting = {
  id: string;
  set_code: string | null;
  set_name: string | null;
  release_date: string | null;
  finish: string | null;
  product: string | null;
  artist: string | null;
  flavor_text: string | null;
  type_text: string | null;
  image_url: string | null;
};

type ApiCard = {
  id: string;
  name: string;
  type: string | null;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  thresholds: { air: number; fire: number; earth: number; water: number } | null;
  elements: string | null;
  subtype1: string | null;
  subtype2: string | null;
  subtype3: string | null;
  rarity: string | null;
  rules: string | null;
  image_url: string | null;
  high_res_image_url: string | null;
  printings: ApiPrinting[] | null;
};

type ApiPage = { data: ApiCard[]; current_page: number; last_page: number; total: number };

// --- Carte telle qu'on la stocke ----------------------------------------

export type SorceryCard = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  lang: string;
  image?: string;
  text?: string;
  foil?: boolean;
  printings?: CardPrinting[];
  // Attributs de jeu, écrits à la racine du document comme pour les autres jeux.
  setName: string;
  releaseDate?: string;
  type?: string;
  subTypes?: string[];
  elements?: string[];
  rarity?: string;
  artist?: string;
  flavorText?: string;
  typeLine?: string;
  cost?: number;
  power?: number;
  defensePower?: number;
  airThreshold?: number;
  earthThreshold?: number;
  fireThreshold?: number;
  waterThreshold?: number;
};

// --- Accès HTTP ----------------------------------------------------------

/**
 * L'API répond ponctuellement en 5xx sur la cinquantaine de requêtes d'un
 * import : un échec isolé ne doit pas coûter une extension entière.
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

// --- Étape 1 : les extensions -------------------------------------------

/**
 * Extensions du catalogue, lues dans le sélecteur « Pack » de la page de
 * recherche : c'est la seule énumération que publie le site — il n'expose ni
 * route des extensions, ni code d'extension sur la fiche d'une carte.
 */
async function fetchSetNames(): Promise<string[]> {
  let published: string[] = [];

  try {
    const html = await (await fetchWithRetry(DATABASE_PAGE)).text();
    published = parse(html)
      .querySelectorAll('select[x-model="filters.setname"] option')
      .map((option) => option.getAttribute("value")?.trim() ?? "")
      .filter(Boolean);
  } catch (error) {
    console.error(`Liste des extensions non récupérée : ${reason(error)}`);
  }

  if (published.length === 0) {
    console.warn(
      `Aucune extension lue sur ${DATABASE_PAGE} : seules les extensions connues du script sont importées. ` +
        `Vérifiez le sélecteur « Pack » de la page si le catalogue en a gagné une.`
    );
  }

  const names = [...new Set([...KNOWN_SET_NAMES, ...published])];
  console.info(`${names.length} extensions : ${names.join(", ")}.`);

  return names;
}

// --- Étape 2 : les cartes d'une extension --------------------------------

/**
 * Toutes les cartes d'une extension. Le filtre `setname` a deux effets : il
 * restreint le catalogue à l'extension, et il fait rendre les impressions —
 * illustrateur, tirage, produit et date de sortie n'existent nulle part
 * ailleurs dans l'API.
 */
async function fetchSetCards(setName: string): Promise<ApiCard[]> {
  const cards = new Map<string, ApiCard>();

  for (let page = 1; ; page++) {
    const url = `${DATABASE_API}?setname=${encodeURIComponent(setName)}&page=${page}&sort=name&sortdirection=asc`;
    const json = await fetchJson<ApiPage>(url);

    // Le catalogue peut bouger entre deux pages : la carte déjà vue n'est pas
    // dupliquée, la dernière lecture faisant foi.
    for (const card of json.data) {
      cards.set(card.id, card);
    }

    if (json.data.length === 0 || page >= json.last_page) {
      break;
    }
  }

  console.info(`${setName} : ${cards.size} cartes.`);

  return [...cards.values()];
}

// --- Transformation ------------------------------------------------------

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Les listes vides ne sont pas écrites : elles n'apprendraient rien du document. */
function nonEmpty(values: (string | null | undefined)[]): string[] | undefined {
  const filtered = [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
  return filtered.length > 0 ? filtered : undefined;
}

function text(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

/** Tirage normal : tout le reste (foil, arc-en-ciel) est une variante. */
const STANDARD_FINISH = "Standard";

/** Produit courant : une variante n'a pas à répéter qu'elle vient d'un booster. */
const BOOSTER_PRODUCT = "Booster";

const FINISH_LABELS: Record<string, string> = {
  Foil: "Foil",
  Rainbow: "Rainbow Foil",
};

/** `Preconstructed_Deck` -> `Preconstructed Deck`. */
function productLabel(product: string | null | undefined): string | undefined {
  return product?.replaceAll("_", " ").trim() || undefined;
}

function isFoil(printing: ApiPrinting): boolean {
  return (printing.finish ?? STANDARD_FINISH) !== STANDARD_FINISH;
}

/**
 * Impression de référence en tête : le tirage normal d'un booster, à défaut le
 * plus ordinaire. C'est elle qui donne l'illustration, l'illustrateur et le
 * texte d'ambiance de la carte ; les suivantes deviennent ses variantes.
 */
function sortPrintings(printings: ApiPrinting[]): ApiPrinting[] {
  const rank = (printing: ApiPrinting) => [
    printing.product === BOOSTER_PRODUCT ? 0 : 1,
    isFoil(printing) ? (printing.finish === "Foil" ? 1 : 2) : 0,
    printing.id.length,
  ];

  return [...printings].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) {
        return ra[i] - rb[i];
      }
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Libellé d'une variante : ce qui la distingue de l'impression de référence —
 * son produit quand ce n'est pas un booster, et son tirage quand il n'est pas
 * normal. Faute des deux, son slug reste le libellé le plus parlant.
 */
function printingName(printing: ApiPrinting): string {
  const finish = printing.finish ?? STANDARD_FINISH;

  const parts = [
    printing.product === BOOSTER_PRODUCT ? undefined : productLabel(printing.product),
    finish === STANDARD_FINISH ? undefined : (FINISH_LABELS[finish] ?? finish),
  ].filter((part): part is string => Boolean(part));

  return parts.join(" — ") || printing.id;
}

/** `Water, Air` -> `["Water", "Air"]`, `None` -> rien. */
function elementsOf(elements: string | null): string[] | undefined {
  if (!elements || elements.trim() === "None") {
    return undefined;
  }
  return nonEmpty(elements.split(","));
}

/** Les sous-types s'accumulent sur trois champs, dont certains listent déjà `Dragon, Undead`. */
function subTypesOf(card: ApiCard): string[] | undefined {
  return nonEmpty([card.subtype1, card.subtype2, card.subtype3].flatMap((value) => value?.split(",") ?? []));
}

/** `2025-12-05T00:00:00.000000Z` -> `2025-12-05`. */
function releaseDateOf(printing: ApiPrinting): string | undefined {
  return printing.release_date?.slice(0, 10) || undefined;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Une carte d'une extension, telle que l'application la collectionne. Rend
 * `undefined` sur une carte que la source ne rattache à aucune impression :
 * sans impression, ni son extension ni son illustration ne sont connues.
 */
function toCard(card: ApiCard, setName: string): SorceryCard | undefined {
  const printings = sortPrintings(card.printings ?? []);
  const [base] = printings;

  if (!base) {
    console.warn(`${setName} : « ${card.id} » n'a aucune impression, elle est écartée.`);
    return undefined;
  }

  const setCode = base.set_code?.trim().toUpperCase();

  if (!setCode) {
    console.warn(`${setName} : « ${card.id} » n'a pas de code d'extension, elle est écartée.`);
    return undefined;
  }

  // Le numéro de collection tient lieu d'identité : un slug inattendu (accent,
  // espace, majuscule) donnerait un identifiant que le formulaire
  // d'administration ne saurait pas reconstruire.
  if (!SLUG.test(card.id)) {
    console.warn(`${setName} : « ${card.id} » n'a pas la forme d'un slug, elle est écartée.`);
    return undefined;
  }

  const variants = withUniquePrintingIds(
    printings.slice(1).map((printing) => ({
      name: printingName(printing),
      foil: isFoil(printing) || undefined,
      image: printing.image_url ?? undefined,
    }))
  );

  return {
    id: buildCardId(GAME, setCode, card.id),
    name: card.name,
    setCode,
    collectorNumber: card.id,
    lang: LANGUAGE,
    image: base.image_url ?? card.high_res_image_url ?? card.image_url ?? undefined,
    text: text(card.rules),
    // La carte n'existe qu'en foil quand aucun de ses tirages n'est normal —
    // le cas de la moitié des promotionnelles.
    foil: printings.every(isFoil) || undefined,
    // Le plafond de variantes n'est pas appliqué ici : il l'est à l'écriture,
    // qui seule connaît aussi celles saisies à la main.
    printings: variants.length > 0 ? variants : undefined,
    setName: base.set_name?.trim() || setName,
    releaseDate: releaseDateOf(base),
    type: text(card.type),
    subTypes: subTypesOf(card),
    elements: elementsOf(card.elements),
    rarity: text(card.rarity),
    artist: text(base.artist),
    flavorText: text(base.flavor_text),
    typeLine: text(base.type_text),
    cost: card.cost ?? undefined,
    // Les deux faces d'une même puissance : la première sert à frapper, la
    // seconde à encaisser (« split power » des Arthurian Legends). Les deux
    // sont écrites même quand elles sont égales — c'est le cas de presque
    // toutes les cartes —, sans quoi filtrer sur la seconde ne rendrait que la
    // trentaine de cartes qui les dissocient.
    power: card.attack ?? undefined,
    defensePower: card.defence ?? undefined,
    airThreshold: card.thresholds?.air,
    earthThreshold: card.thresholds?.earth,
    fireThreshold: card.thresholds?.fire,
    waterThreshold: card.thresholds?.water,
  };
}

// --- Téléchargement complet ---------------------------------------------

async function fetchCatalog(): Promise<SorceryCard[]> {
  const setNames = await fetchSetNames();

  const byId = new Map<string, SorceryCard>();

  for (const setName of setNames) {
    const cards = await fetchSetCards(setName);

    if (cards.length === 0) {
      console.warn(`${setName} : aucune carte, l'extension est ignorée.`);
      continue;
    }

    for (const card of cards) {
      const converted = toCard(card, setName);

      if (!converted) {
        continue;
      }

      const taken = byId.get(converted.id);

      // Deux extensions qui rendraient le même code (un renommage chez la
      // source) écraseraient l'une l'autre sans que rien ne le dise.
      if (taken && taken.setName !== converted.setName) {
        console.warn(
          `${converted.id} : « ${converted.setName} » et « ${taken.setName} » partagent le code ${converted.setCode}.`
        );
      }

      byId.set(converted.id, converted);
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// --- Écriture ------------------------------------------------------------

/** Le jeu doit exister en base : le script ne crée pas de jeu. */
async function resolveGameId(): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug: GAME_SLUG }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(
      `Aucun jeu avec le slug « ${GAME_SLUG} » : créez-le depuis l'administration, ou passez SORCERY_GAME_SLUG.`
    );
  }

  return game._id;
}

/**
 * Variantes déjà enregistrées que l'import ne connaît pas, par identifiant de
 * carte.
 *
 * Les variantes de Sorcery viennent de la source, qui publie tous les tirages
 * d'une carte : l'import les réécrit donc. Mais une variante peut aussi avoir
 * été saisie depuis l'administration, et celle-là n'existe nulle part chez la
 * source — la réécriture la perdrait, en base comme dans l'index.
 */
async function readExtraPrintings(cards: SorceryCard[], gameId: ObjectId): Promise<Map<string, CardPrinting[]>> {
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
 * de la source. Le plafond n'est jamais atteint aujourd'hui — trois variantes
 * au plus par carte —, mais une carte qui le franchirait perdrait des tirages
 * en silence, et c'est ici que ça se voit.
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

async function writeCards(cards: SorceryCard[]): Promise<void> {
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
        // sous-type…) ne doit pas être écrite en `null` sur le document
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

  // L'index n'est **pas** vidé : il porte aussi les cartes ajoutées à la main
  // depuis l'administration, que la source ne republiera jamais.
  const index = meilisearch.index(indexes[GAME].name);
  for (let offset = 0; offset < complete.length; offset += 1000) {
    await index.addDocuments(complete.slice(offset, offset + 1000).map((card) => importedCardSearchDocument(card)));
    console.info(`Index : ${Math.min(offset + 1000, complete.length)}/${complete.length}`);
  }
}

// --- Entrée --------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fromFile = args.includes("--from-file");
  const fetchOnly = args.includes("--fetch-only");

  const cards: SorceryCard[] = fromFile ? JSON.parse(await readFile(CARDS_FILE, "utf-8")) : await fetchCatalog();

  if (!fromFile) {
    await writeFile(CARDS_FILE, JSON.stringify(cards, null, 2));
    console.info(`${cards.length} cartes écrites dans ${CARDS_FILE}.`);
  }

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
