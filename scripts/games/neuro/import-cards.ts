/**
 * Import du catalogue NeuroScape depuis playneuroscape.com, qui publie ses
 * cartes par l'API carde.io
 * (https://api.admin.carde.io/api/v2/deckbuilder/cards/search-with-filters/).
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/games/neuro/import-cards.ts [--fetch-only|--from-file]
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
 * `MEILISEARCH_API_KEY`, `NEURO_GAME_SLUG` si le jeu n'a pas le slug `neuro`
 * (il porte l'identifiant 6a9547e2fb04970c85262006 en production), et
 * `NEURO_CARDEIO_GAME_ID` si carde.io renumérote le jeu.
 *
 * Après le premier import, les filtres de la galerie demandent que l'index
 * déclare les attributs du jeu : c'est le bouton « Mettre à jour l'index » de
 * l'administration des cartes, cf. docs/CARD_EXPLORER_FILTERS.md. Le script les
 * pose déjà lui-même, un premier import laisse donc une galerie utilisable.
 *
 * ## Une seule route, qui ne répond qu'en POST
 *
 * carde.io héberge les catalogues de plusieurs jeux derrière la même API : la
 * recherche est une requête POST, et le jeu s'y désigne par un entier —
 * NeuroScape est le 134. Elle rend tout le catalogue par tranches de 250 au
 * plus, dans l'ordre alphabétique tant qu'on ne lui demande pas d'ordre : un
 * `sort_by` qu'elle ne connaît pas ne fait pas d'erreur, il rend les cartes en
 * vrac — deux pages se recouvriraient alors sans que rien ne le dise. Le script
 * n'en demande donc aucun, dédoublonne par identifiant, et vérifie à la fin
 * qu'il a bien le compte annoncé.
 *
 * ## Le code d'extension est celui qui est imprimé, pas celui de l'API
 *
 * L'API nomme l'extension `GENESIS` (son `set_code` recopie son `set_name`),
 * quand la carte, elle, porte `GEN 234/255` en pied — et c'est ce code-là que le
 * joueur a sous les yeux, celui avec lequel il cherche sa carte. C'est aussi
 * celui du fichier de l'illustration (`GEN-234.webp`), d'où il est repris : le
 * numéro qui suit le tiret doit être celui de la carte, faute de quoi le nom du
 * fichier ne dit rien de son extension et c'est le `set_code` de l'API qui sert
 * de repli. Une carte vaut donc `GEN234`, comme Riftbound colle les siens
 * (cf. `lib/constants/card-ids.ts`).
 *
 * ## L'illustration est signée pour la journée
 *
 * L'API rend l'image avec une signature Google Cloud Storage valable 24 heures.
 * Enregistrée telle quelle, chaque illustration de la galerie tomberait le
 * lendemain de l'import. La signature est donc retirée : l'objet est lisible
 * publiquement sans elle.
 *
 * ## Ce qui est écarté de la source
 *
 * - `flavor_text` : la fiche de carte n'affiche que les attributs de
 *   `CARD_ATTRIBUTE_KEYS`, dont il ne fait pas partie — il n'apparaîtrait donc
 *   nulle part, sinon en garnissant la barre latérale de la galerie de citations
 *   à cocher, les facettes étant déduites des attributs portés par les cartes ;
 * - `card_copies_limit` : le nombre d'exemplaires autorisés est une règle de
 *   format, que l'application tient sur le format du jeu et non sur la carte
 *   (cf. `lib/decks/contents.ts`) ;
 * - `type` et `subtype` : toujours nuls, `card_type` étant la version minuscule
 *   de `type_line` ;
 * - `normalized_name`, `display_name`, `internal_id`, `gamecard_type`,
 *   `reprint`, `created_at`, `updated_at` : ils ne disent rien de la carte que
 *   l'application ne sache déjà, ou rien du tout (`reprint` est faux partout).
 *
 * ## Une carte sans type
 *
 * « Basic Ram » (GEN255) n'a ni type ni faction chez la source, et n'en imprime
 * pas non plus : elle n'est pas jouée dans le deck mais dans la RAM. Elle est
 * importée telle quelle, sans type — lui en inventer un la ferait remonter dans
 * un filtre où le jeu lui-même ne la range pas.
 */
import { readFile, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import db from "../../../lib/mongodb.ts";
import meilisearch, { cardIndexSettings, ensureCardIndex, indexes } from "../../../lib/meilisearch.ts";
import { getGameCardFilterFacets } from "../../../lib/db/cards.ts";
import { importedCardSearchDocument } from "../../../lib/cards/import-search.ts";
import { buildCardId } from "../../../lib/constants/card-ids.ts";
import type { CardOrientation, CardPrinting } from "../../../lib/types/card.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEARCH_API = "https://api.admin.carde.io/api/v2/deckbuilder/cards/search-with-filters/";

/** Convention d'identifiant du jeu, indépendante du slug qu'il porte en base. */
const GAME = "neuro";

/** Slug du jeu en base. Surchargeable si le jeu a été créé sous un autre slug. */
const GAME_SLUG = process.env.NEURO_GAME_SLUG ?? GAME;

/** NeuroScape chez carde.io, qui numérote les jeux qu'il héberge. */
const CARDEIO_GAME_ID = Number(process.env.NEURO_CARDEIO_GAME_ID ?? 134);

/** Le catalogue n'est publié qu'en anglais, et les cartes portent `EN` en pied. */
const LANGUAGE = "en";

/** Tranche maximale que l'API accepte : au-delà, elle refuse la requête. */
const PAGE_SIZE = 250;

const CARDS_FILE = path.join(__dirname, "cards.json");

// --- Types de l'API ------------------------------------------------------

type ApiCard = {
  id: string;
  name: string;
  /** Le type seul (`PROGRAM`), là où la carte imprime `PROGRAM = ENVIRONMENT`. */
  type_line: string | null;
  set_name: string | null;
  set_code: string | null;
  collector_number: string | null;
  image_url: string | null;
  artist: string | null;
  rules_text: string | null;
  rarity: string | null;
  is_landscape: boolean | null;
  /** Le coût en RAM, que la source modélise en liste. */
  ram_cost: string[] | null;
  factions: string[] | null;
  attack_type: string | null;
  attack: number | null;
  defence: number | null;
  /** Classe d'un programme (`SCRIPT`, `TAROT`…), vide sur les autres types. */
  program_class: string | null;
  /** Classe d'un équipement, que le site filtre sous « Gear Class ». */
  cyberware_class: string | null;
  /** Marqueur imprimé dans la ligne de type : `CHARACTER = ICONIC WONDERLAND`. */
  iconic: boolean | null;
};

type ApiPage = { cards: ApiCard[]; total: number; has_more: boolean; limit: number; offset: number };

// --- Carte telle qu'on la stocke ----------------------------------------

export type NeuroScapeCard = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  lang: string;
  image?: string;
  text?: string;
  // Attributs de jeu, écrits à la racine du document comme pour les autres jeux.
  setName?: string;
  type?: string;
  rarity?: string;
  factions?: string[];
  cost?: number;
  power?: number;
  defensePower?: number;
  attackType?: string;
  programClass?: string;
  gearClass?: string;
  illustrator?: string[];
  iconic?: boolean;
  orientation?: CardOrientation;
};

// --- Accès HTTP ----------------------------------------------------------

/**
 * Une page du catalogue. Un échec isolé — l'API répond ponctuellement en 5xx —
 * ne doit pas coûter tout l'import : la requête est reprise quelques fois avant
 * d'abandonner.
 */
async function fetchPage(offset: number, attempt = 1): Promise<ApiPage> {
  const MAX_ATTEMPTS = 5;

  try {
    const response = await fetch(SEARCH_API, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ game_id: CARDEIO_GAME_ID, limit: PAGE_SIZE, offset }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${SEARCH_API} (offset ${offset})`);
    }

    return (await response.json()) as ApiPage;
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    return fetchPage(offset, attempt + 1);
  }
}

// --- Transformation ------------------------------------------------------

function text(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

/** Les listes vides ne sont pas écrites : elles n'apprendraient rien du document. */
function nonEmpty(values: (string | null | undefined)[]): string[] | undefined {
  const filtered = [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
  return filtered.length > 0 ? filtered : undefined;
}

/** L'illustration sans sa signature, qui ne vaut qu'une journée. */
function imageOf(card: ApiCard): string | undefined {
  return text(card.image_url?.split("?")[0]);
}

/** `GEN-234.webp` -> code d'extension `GEN` et numéro `234`. */
const IMAGE_FILE = /^([A-Z0-9]+)-(.+)\.[A-Za-z0-9]+$/;

/**
 * Code d'extension imprimé sur la carte, lu dans le nom de son illustration et
 * confirmé par le numéro de collection. À défaut, celui de l'API — moins juste,
 * mais toujours vrai.
 */
function setCodeOf(card: ApiCard, image: string | undefined): string | undefined {
  const fileName = image?.split("/").pop() ?? "";
  const printed = IMAGE_FILE.exec(fileName);

  if (printed && printed[2] === card.collector_number?.trim()) {
    return printed[1];
  }

  return text(card.set_code)?.toUpperCase();
}

/**
 * Coût en RAM. La source le modélise en liste sans jamais en donner plus d'un ;
 * une carte qui en porterait deux perdrait le second en silence, et c'est ici
 * que ça se voit.
 */
function costOf(card: ApiCard): number | undefined {
  const [first, ...rest] = (card.ram_cost ?? []).map((value) => value.trim()).filter(Boolean);

  if (first === undefined) {
    return undefined;
  }

  if (rest.length > 0) {
    console.warn(`${card.name} : coûts multiples (${[first, ...rest].join(", ")}), seul ${first} est repris.`);
  }

  const cost = Number(first);

  if (!Number.isFinite(cost)) {
    console.warn(`${card.name} : le coût « ${first} » n'est pas un nombre, il est écarté.`);
    return undefined;
  }

  return cost;
}

/**
 * Une carte du catalogue, telle que l'application la collectionne. Rend
 * `undefined` sur une carte dont l'extension ou le numéro manquent : les deux
 * font son identité, et une carte sans identifiant n'est pas collectionnable.
 */
function toCard(card: ApiCard): NeuroScapeCard | undefined {
  const image = imageOf(card);
  const setCode = setCodeOf(card, image);
  const collectorNumber = text(card.collector_number);

  if (!setCode || !collectorNumber) {
    console.warn(`« ${card.name} » n'a pas d'extension ou pas de numéro de collection, elle est écartée.`);
    return undefined;
  }

  return {
    id: buildCardId(GAME, setCode, collectorNumber),
    name: card.name,
    setCode,
    collectorNumber,
    lang: LANGUAGE,
    image,
    text: text(card.rules_text),
    setName: text(card.set_name),
    type: text(card.type_line)?.toUpperCase(),
    rarity: text(card.rarity)?.toUpperCase(),
    factions: nonEmpty(card.factions ?? []),
    cost: costOf(card),
    // `power` et `defensePower` plutôt qu'`attack` et `defence` : ce sont les
    // clés que portent déjà les autres jeux, et `power` est la seule des deux
    // que la fiche de carte affiche (`CARD_ATTRIBUTE_KEYS`).
    power: card.attack ?? undefined,
    defensePower: card.defence ?? undefined,
    attackType: text(card.attack_type)?.toUpperCase(),
    programClass: text(card.program_class)?.toUpperCase(),
    // `gearClass` : la source l'appelle encore `cyberware_class`, le jeu le
    // filtre sous « Gear Class » et les cartes concernées sont les GEAR.
    gearClass: text(card.cyberware_class)?.toUpperCase(),
    // `illustrator` plutôt qu'`artist` : c'est la clé que porte
    // `CARD_ATTRIBUTE_KEYS`, la seule que la fiche de carte affiche.
    illustrator: nonEmpty([card.artist]),
    iconic: card.iconic ? true : undefined,
    // L'absence de la propriété vaut `portrait`, cf. docs/CARD_ORIENTATION.md.
    orientation: card.is_landscape ? "landscape" : undefined,
  };
}

// --- Téléchargement complet ---------------------------------------------

async function fetchCatalog(): Promise<NeuroScapeCard[]> {
  const byId = new Map<string, NeuroScapeCard>();
  const seen = new Set<string>();
  let announced = 0;

  for (let offset = 0; ; ) {
    const page = await fetchPage(offset);
    announced = page.total;

    for (const card of page.cards) {
      seen.add(card.id);

      const converted = toCard(card);

      if (!converted) {
        continue;
      }

      const taken = byId.get(converted.id);

      // Deux cartes qui rendraient le même identifiant s'écraseraient l'une
      // l'autre — et la seconde effacerait la première en base.
      if (taken && taken.name !== converted.name) {
        console.warn(`${converted.id} : « ${converted.name} » et « ${taken.name} » portent le même identifiant.`);
      }

      byId.set(converted.id, converted);
    }

    console.info(`${seen.size}/${page.total} cartes lues.`);

    if (!page.has_more || page.cards.length === 0) {
      break;
    }

    offset += page.cards.length;
  }

  // Le catalogue peut bouger d'une page à l'autre : sans ce contrôle, une carte
  // sautée par le décalage manquerait sans que rien ne le dise.
  if (seen.size !== announced) {
    console.warn(`${seen.size} cartes lues pour ${announced} annoncées par la source.`);
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// --- Écriture ------------------------------------------------------------

/** Le jeu doit exister en base : le script ne crée pas de jeu. */
async function resolveGameId(): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug: GAME_SLUG }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(
      `Aucun jeu avec le slug « ${GAME_SLUG} » : créez-le depuis l'administration, ou passez NEURO_GAME_SLUG.`
    );
  }

  return game._id;
}

/**
 * Variantes d'impression déjà enregistrées, par identifiant de carte.
 *
 * La source ne publie qu'un tirage par carte : l'import n'écrit donc jamais de
 * variante, et celles saisies depuis l'administration survivent en base — il
 * n'y écrit que les champs qu'il connaît. Le document de recherche, lui, est
 * réécrit en entier : sans ce rappel, les variantes disparaîtraient de la
 * galerie, des boosters et des listes de souhaits, qui les lisent dans l'index.
 */
async function readStoredPrintings(ids: string[], gameId: ObjectId): Promise<Map<string, CardPrinting[]>> {
  const docs = await db
    .collection("cards")
    .find({ gameId, id: { $in: ids } }, { projection: { _id: 0, id: 1, printings: 1 } })
    .toArray();

  return new Map(
    docs.flatMap((doc) =>
      typeof doc.id === "string" && Array.isArray(doc.printings) && doc.printings.length > 0
        ? [[doc.id, doc.printings as CardPrinting[]] as const]
        : []
    )
  );
}

async function writeCards(cards: NeuroScapeCard[]): Promise<void> {
  const gameId = await resolveGameId();

  console.info(`Écriture de ${cards.length} cartes pour le jeu « ${GAME_SLUG} » (${gameId})...`);

  const BATCH = 500;
  for (let index = 0; index < cards.length; index += BATCH) {
    const batch = cards.slice(index, index + BATCH);

    await db.collection("cards").bulkWrite(
      batch.map((card) => {
        // Une propriété absente de la source (une carte sans coût, sans
        // faction…) ne doit pas être écrite en `null` sur le document existant.
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

  await writeSearchIndex(cards, gameId);
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
async function writeSearchIndex(cards: NeuroScapeCard[], gameId: ObjectId): Promise<void> {
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

  const storedPrintings = await readStoredPrintings(
    cards.map((card) => card.id),
    gameId
  );

  if (storedPrintings.size > 0) {
    console.info(`${storedPrintings.size} cartes portent des variantes saisies à la main, elles sont conservées.`);
  }

  const index = meilisearch.index(indexConfig.name);
  for (let offset = 0; offset < cards.length; offset += 1000) {
    await index.addDocuments(
      cards
        .slice(offset, offset + 1000)
        .map((card) => importedCardSearchDocument(card, storedPrintings.get(card.id)))
    );
    console.info(`Index : ${Math.min(offset + 1000, cards.length)}/${cards.length}`);
  }
}

// --- Entrée --------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fromFile = args.includes("--from-file");
  const fetchOnly = args.includes("--fetch-only");

  const cards: NeuroScapeCard[] = fromFile ? JSON.parse(await readFile(CARDS_FILE, "utf-8")) : await fetchCatalog();

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
