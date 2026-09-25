import 'server-only';

import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import { ensureCardPriceIndexes, upsertCardPrices } from "@/lib/db/card-price-writes";
import { getLastCardPriceImport, recordCardPriceImport } from "@/lib/db/card-price-imports";
import {
  CARDMARKET_GAME_IDS,
  fetchCardmarketPriceGuide,
  fetchCardmarketProducts,
  parseCardmarketDate,
  type CardmarketPriceGuide,
} from "@/lib/prices/cardmarket";
import { CARDMARKET_GAME_PROFILES, matchCardmarketProducts } from "@/lib/prices/cardmarket-matching";
import { buildCardPrice } from "@/lib/prices/cardmarket-prices";
import {
  CARDNEXUS_GAME_IDS,
  type CardnexusExpansion,
  type CardnexusFinishPrices,
  type CardnexusPriceRecord,
  type CardnexusProduct,
} from "@/lib/prices/cardnexus";
import { fetchCardnexusFeeds, streamCardnexusFeed } from "@/lib/prices/cardnexus-feed";
import { CARDNEXUS_GAME_PROFILES, matchCardnexusProducts } from "@/lib/prices/cardnexus-matching";
import { buildCardnexusPrice } from "@/lib/prices/cardnexus-prices";
import { checkImportCoverage, type ImportCoverage } from "@/lib/prices/import-guard";
import type { CardPrice, CardPriceSource, PriceableCard } from "@/lib/types/card-price";

/**
 * Imports des prix Cardmarket et CardNexus.
 *
 * Deux appelants : les scripts de `scripts/prices/`, lancés à la main, et le
 * cron quotidien (`app/api/cron/prices-*`). Les deux font la même chose ; le
 * script peut en plus ne rien écrire (`dryRun`), détailler son rapprochement
 * (`verbose`) ou passer outre le garde-fou (`force`).
 *
 * Le relevé est un instantané : chaque import réécrit les relevés de sa place
 * de marché, sans historique. Cf. docs/CARD_PRICES.md.
 */

export type PriceImportOptions = {
  slug: string;
  /** Rapproche et affiche le bilan sans rien écrire en base. */
  dryRun?: boolean;
  /** Écrit même si le garde-fou juge la couverture effondrée. */
  force?: boolean;
  /** Détaille le rapprochement, extension par extension. */
  verbose?: boolean;
  log?: (line: string) => void;
};

export type PriceImportResult = ImportCoverage & {
  source: CardPriceSource;
  slug: string;
  /**
   * - `written` : relevés écrits ;
   * - `dry-run` : rien d'écrit, à la demande ;
   * - `rejected` : rien d'écrit, le garde-fou a refusé (`reason`) ;
   * - `no-cards` : le jeu n'a pas de carte en base, il n'y a rien à coter.
   */
  status: "written" | "dry-run" | "rejected" | "no-cards";
  written: number;
  reason?: string;
};

/** Slugs de jeu qu'un import sait traiter, par place de marché. */
export const IMPORTABLE_GAME_SLUGS: Record<CardPriceSource, string[]> = {
  cardmarket: Object.keys(CARDMARKET_GAME_PROFILES).filter((slug) => slug in CARDMARKET_GAME_IDS),
  cardnexus: Object.keys(CARDNEXUS_GAME_IDS),
};

/**
 * Jeux présents en base qu'un import de cette place de marché sait traiter.
 * Le cron ne les connaît pas d'avance : un jeu ajouté à la plateforme est coté
 * dès qu'il figure dans les tables de la place de marché.
 */
export async function importableGameSlugs(source: CardPriceSource): Promise<string[]> {
  const games = await db
    .collection("games")
    .find({ slug: { $in: IMPORTABLE_GAME_SLUGS[source] } }, { projection: { slug: 1 } })
    .toArray();

  return games.map((game) => game.slug as string).sort();
}

/** Le jeu doit exister en base : l'import ne crée pas de jeu. */
async function resolveGameId(slug: string): Promise<ObjectId> {
  const game = await db.collection("games").findOne({ slug }, { projection: { _id: 1 } });

  if (!game) {
    throw new Error(`Aucun jeu avec le slug « ${slug} ».`);
  }

  return game._id;
}

/**
 * Cartes du jeu telles que le rapprochement les lit : leur identité, et les
 * seuls attributs dont le profil du jeu a besoin pour distinguer deux cartes
 * de même nom.
 */
async function loadCards(gameId: ObjectId, attributeKeys: readonly string[] = []): Promise<PriceableCard[]> {
  const projection = {
    _id: 0,
    id: 1,
    name: 1,
    setCode: 1,
    collectorNumber: 1,
    ...Object.fromEntries(attributeKeys.map((key) => [key, 1])),
  };

  const docs = await db.collection<PriceableCard>("cards").find({ gameId }, { projection }).toArray();

  return docs.filter((card) => typeof card.id === "string" && typeof card.name === "string");
}

/**
 * Cartes dont l'identifiant en désigne une seule.
 *
 * Le catalogue Star Wars Unlimited en compte quelques centaines qui n'en sont
 * pas : le site officiel renumérote les variantes, si bien que `SOR-5` est à la
 * fois « Luke Skywalker, Faithful Friend » en standard et « I Am Your Father »
 * en hyperespace. Un relevé étant écrit par identifiant de carte, le prix de
 * l'une écraserait celui de l'autre : ni l'une ni l'autre n'en reçoit.
 */
function withUniqueIds(cards: PriceableCard[]): { cards: PriceableCard[]; dropped: number } {
  const byId = new Map<string, PriceableCard[]>();
  for (const card of cards) {
    byId.set(card.id, [...(byId.get(card.id) ?? []), card]);
  }

  const unique = [...byId.values()].filter((sharing) => sharing.length === 1).flat();

  return { cards: unique, dropped: cards.length - unique.length };
}

function percent(part: number, total: number): string {
  return total > 0 ? `${((100 * part) / total).toFixed(1)} %` : "—";
}

/** Le feed est un flux : il se lit une fois, et se range au passage. */
async function collect<T>(feed: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of feed) {
    items.push(item);
  }
  return items;
}

/** Les extensions de notre catalogue qui restent le plus souvent sans prix. */
function logWorstSets(cards: PriceableCard[], matches: Map<string, unknown>, log: (line: string) => void) {
  const missingBySet = new Map<string, number>();
  for (const card of cards) {
    if (!matches.has(card.id)) {
      const setCode = card.setCode ?? "—";
      missingBySet.set(setCode, (missingBySet.get(setCode) ?? 0) + 1);
    }
  }

  const worstSets = [...missingBySet].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (worstSets.length > 0) {
    log(`Extensions les moins couvertes : ${worstSets.map(([setCode, count]) => `${setCode} (${count})`).join(", ")}.`);
  }
}

/**
 * Fin commune des deux imports : le garde-fou, puis l'écriture des relevés
 * et du bilan qui servira de référence au suivant.
 */
async function writePrices(
  source: CardPriceSource,
  slug: string,
  gameId: ObjectId,
  prices: CardPrice[],
  coverage: ImportCoverage,
  sourceUpdatedAt: Date,
  { dryRun = false, force = false, log = console.info }: PriceImportOptions
): Promise<PriceImportResult> {
  const result = { source, slug, ...coverage, written: 0 };

  const verdict = checkImportCoverage(coverage, await getLastCardPriceImport(gameId, source));

  if (dryRun) {
    log(`\nGarde-fou : ${verdict.ok ? "l'import serait écrit" : `l'import serait refusé (${verdict.reason})`}.`);
    log("--dry-run : rien n'a été écrit en base.");
    return { ...result, status: "dry-run" };
  }

  if (!verdict.ok) {
    if (!force) {
      log(`\nImport refusé : ${verdict.reason}. Rien n'a été écrit ; relancer à la main avec --force s'il est juste.`);
      return { ...result, status: "rejected", reason: verdict.reason };
    }

    log(`\nGarde-fou ignoré (--force) : ${verdict.reason}.`);
  }

  await ensureCardPriceIndexes();
  const { written } = await upsertCardPrices(gameId, prices);
  await recordCardPriceImport(gameId, source, { ...coverage, written, sourceUpdatedAt, importedAt: new Date() });
  log(`\n${prices.length} relevés écrits (${written} créés ou modifiés).`);

  return { ...result, status: "written", written };
}

/**
 * Import des prix Cardmarket.
 *
 * Cardmarket publie en accès libre (https://www.cardmarket.com/Data/Download)
 * la liste des cartes d'un jeu et son guide des prix, recalculé une fois par
 * jour. L'import télécharge ces deux fichiers, rapproche leurs produits des
 * cartes de la plateforme, et écrit un relevé par carte reconnue.
 */
export async function importCardmarketPrices(options: PriceImportOptions): Promise<PriceImportResult> {
  const { slug, verbose = false, log = console.info } = options;

  const cardmarketGameId = CARDMARKET_GAME_IDS[slug];
  const profile = CARDMARKET_GAME_PROFILES[slug];

  if (!cardmarketGameId) {
    throw new Error(
      `Le jeu « ${slug} » n'a pas d'identifiant Cardmarket connu : ajoutez-le à CARDMARKET_GAME_IDS (lib/prices/cardmarket.ts).`
    );
  }

  if (!profile) {
    throw new Error(
      `Le jeu « ${slug} » n'a pas de profil de rapprochement : ajoutez-le à CARDMARKET_GAME_PROFILES (lib/prices/cardmarket-matching.ts).`
    );
  }

  const gameId = await resolveGameId(slug);

  log(`Cartes du jeu « ${slug} » (${gameId})...`);
  const { cards, dropped } = withUniqueIds(await loadCards(gameId, profile.attributeKeys));
  log(
    `${cards.length} cartes en base` +
      (dropped > 0 ? `, ${dropped} écartées : leur identifiant en désigne plusieurs.` : ".")
  );

  if (cards.length === 0) {
    return { source: "cardmarket", slug, cards: 0, matched: 0, priced: 0, written: 0, status: "no-cards" };
  }

  log(`Téléchargement du catalogue et des prix Cardmarket (jeu ${cardmarketGameId})...`);
  const [productFile, priceFile] = await Promise.all([
    fetchCardmarketProducts(cardmarketGameId),
    fetchCardmarketPriceGuide(cardmarketGameId),
  ]);
  log(
    `${productFile.products.length} produits (${productFile.createdAt}), ` +
      `${priceFile.priceGuides.length} lignes de prix (${priceFile.createdAt}).`
  );

  const { matches, expansions, paired, skipped } = matchCardmarketProducts(productFile.products, cards, profile);

  const priceGuides = new Map<number, CardmarketPriceGuide>(
    priceFile.priceGuides.map((guide) => [guide.idProduct, guide])
  );

  const sourceUpdatedAt = parseCardmarketDate(priceFile.createdAt);
  const updatedAt = new Date();

  const prices = [...matches].flatMap<CardPrice>(([cardId, products]) => {
    const price = buildCardPrice(cardId, products, priceGuides, { sourceUpdatedAt, updatedAt });
    return price ? [price] : [];
  });

  // --- Bilan ------------------------------------------------------------

  const mappedExpansions = expansions.filter((expansion) => expansion.setCodes.length > 0);
  log(
    `\nExtensions Cardmarket reconnues : ${mappedExpansions.length}/${expansions.length}. ` +
      `Produits écartés : ${skipped.unknownCard} sans carte de ce nom, ` +
      `${skipped.unmappedExpansion} sans extension reconnue, ${skipped.ambiguous} ambigus. ` +
      `${paired} produits attribués par l'ordre des numéros de collection.`
  );

  if (verbose) {
    for (const expansion of [...expansions].sort((a, b) => a.idExpansion - b.idExpansion)) {
      const recognized = expansion.setCodes
        .map((match) => `${match.setCode} (${(100 * match.score).toFixed(0)} %, ${match.common} cartes)`)
        .join(", ");
      log(`  exp ${expansion.idExpansion} — ${expansion.products} produits → ${recognized || "non reconnue"}`);
    }
  }

  log(
    `Cartes rapprochées : ${matches.size}/${cards.length} (${percent(matches.size, cards.length)}), ` +
      `dont ${prices.length} avec au moins un prix.`
  );
  logWorstSets(cards, matches, log);

  // --- Écriture ---------------------------------------------------------

  const coverage = { cards: cards.length, matched: matches.size, priced: prices.length };
  return writePrices("cardmarket", slug, gameId, prices, coverage, sourceUpdatedAt, options);
}

/**
 * Import des prix CardNexus.
 *
 * CardNexus publie, sous clé d'API, trois « feeds » par jeu : ses extensions,
 * son catalogue de produits et les prix courants de chacun
 * (https://docs.cardnexus.com/feeds). L'import les télécharge, rapproche les
 * produits des cartes de la plateforme — par extension et numéro de collection,
 * pas par ressemblance de noms — et écrit un relevé par carte reconnue.
 *
 * Il cohabite avec celui de Cardmarket : les deux fournisseurs écrivent chacun
 * leur relevé, et l'application choisit ensuite lequel montrer, carte par carte.
 */
export async function importCardnexusPrices(
  options: PriceImportOptions & { apiKey: string | undefined }
): Promise<PriceImportResult> {
  const { slug, apiKey, verbose = false, log = console.info } = options;

  const cardnexusGameId = CARDNEXUS_GAME_IDS[slug];

  if (!cardnexusGameId) {
    throw new Error(
      `Le jeu « ${slug} » n'a pas d'identifiant CardNexus connu : ajoutez-le à CARDNEXUS_GAME_IDS (lib/prices/cardnexus.ts).`
    );
  }

  if (!apiKey) {
    throw new Error("CARDNEXUS_API_KEY est absente : les feeds CardNexus ne sont pas publics.");
  }

  const gameId = await resolveGameId(slug);

  log(`Cartes du jeu « ${slug} » (${gameId})...`);
  // Les variantes ne sont lues que pour leur identité : ce sont elles qui
  // reçoivent les prix des tirages cotés à part (le Beta de Cyberpunk).
  const { cards, dropped } = withUniqueIds(
    await loadCards(gameId, ["printings.id", "printings.setCode", "printings.collectorNumber"])
  );
  log(
    `${cards.length} cartes en base` +
      (dropped > 0 ? `, ${dropped} écartées : leur identifiant en désigne plusieurs.` : ".")
  );

  // Magic, notamment : ses cartes ne vivent que dans l'index de recherche.
  if (cards.length === 0) {
    return { source: "cardnexus", slug, cards: 0, matched: 0, priced: 0, written: 0, status: "no-cards" };
  }

  log(`Feeds CardNexus du jeu « ${cardnexusGameId} »...`);
  const feeds = await fetchCardnexusFeeds(cardnexusGameId, apiKey);
  log(
    `catalogue ${feeds.catalog.recordCount} produits (${feeds.catalog.generatedAt}), ` +
      `${feeds.expansions.recordCount} extensions, ` +
      `prix ${feeds.prices.recordCount} produits (${feeds.prices.generatedAt}).`
  );

  // Le catalogue passe en flux : il ne sert qu'une fois, et le garder d'un bloc
  // coûterait quelques centaines de mégaoctets sur un gros jeu pour des produits
  // dont la plupart ne trouveront aucune carte. Les extensions, elles, se lisent
  // d'un bloc — il en faut la table entière avant le premier produit.
  const expansions = await collect(streamCardnexusFeed<CardnexusExpansion>(feeds.expansions));

  const { matches, printingMatches, expansions: setReports, skipped } = await matchCardnexusProducts(
    streamCardnexusFeed<CardnexusProduct>(feeds.catalog),
    expansions,
    cards,
    CARDNEXUS_GAME_PROFILES[slug]
  );

  // Les prix ne sont gardés que pour les produits rapprochés : le feed en
  // couvre tout le jeu, produits scellés compris, et le reste ne sera jamais lu.
  const matchedProductIds = new Set(
    [...matches.values(), ...[...printingMatches.values()].flatMap((byPrinting) => [...byPrinting.values()])]
      .flat()
      .map((product) => product.id)
  );
  const pricesByProduct = new Map<number, Record<string, CardnexusFinishPrices>>();

  for await (const record of streamCardnexusFeed<CardnexusPriceRecord>(feeds.prices)) {
    if (record.pricesByFinish && matchedProductIds.has(record.productId)) {
      pricesByProduct.set(record.productId, record.pricesByFinish);
    }
  }

  // La date du relevé est celle du contenu du feed, pas celle de sa dernière
  // reconstruction : CardNexus republie un fichier identique sans le changer.
  const sourceUpdatedAt = new Date(feeds.prices.generatedAt);
  const updatedAt = new Date();

  if (Number.isNaN(sourceUpdatedAt.getTime())) {
    throw new Error(`Date CardNexus illisible : « ${feeds.prices.generatedAt} ».`);
  }

  // Une carte dont seules les variantes ont trouvé un produit a son relevé
  // aussi : il ne porte que les prix de ses variantes.
  const matchedCardIds = [...new Set([...matches.keys(), ...printingMatches.keys()])];
  const prices = matchedCardIds.flatMap<CardPrice>((cardId) => {
    const price = buildCardnexusPrice(
      cardId,
      matches.get(cardId) ?? [],
      pricesByProduct,
      { sourceUpdatedAt, updatedAt },
      printingMatches.get(cardId)
    );
    return price ? [price] : [];
  });
  const printingCount = [...printingMatches.values()].reduce((total, byPrinting) => total + byPrinting.size, 0);

  // --- Bilan ------------------------------------------------------------

  const namedSets = setReports.filter((set) => set.setCode);
  log(
    `\nExtensions CardNexus : ${namedSets.length}/${setReports.length} portent un code. ` +
      `Produits écartés : ${skipped.sealed} scellés, ` +
      `${skipped.unknownExpansion} sans extension reconnue, ` +
      `${skipped.noPrintNumber} sans numéro de collection, ` +
      `${skipped.unknownCard} sans carte à ce numéro, ` +
      `${skipped.ambiguous} ambigus (deux cartes au même numéro).`
  );

  if (verbose) {
    for (const set of [...setReports].sort((a, b) => a.matched / a.products - b.matched / b.products)) {
      log(
        `  ${set.setCode ?? "sans code"} — ${set.name} : ` +
          `${set.matched}/${set.products} produits rapprochés (${percent(set.matched, set.products)})`
      );
    }
  }

  log(
    `Cartes rapprochées : ${matches.size}/${cards.length} (${percent(matches.size, cards.length)}), ` +
      `variantes rapprochées : ${printingCount}, ` +
      `${prices.length} relevés avec au moins un prix en euros.`
  );
  logWorstSets(cards, matches, log);

  // --- Écriture ---------------------------------------------------------

  const coverage = { cards: cards.length, matched: matchedCardIds.length, priced: prices.length };
  return writePrices("cardnexus", slug, gameId, prices, coverage, sourceUpdatedAt, options);
}

export type PriceImportRun = PriceImportResult | { source: CardPriceSource; slug: string; status: "failed"; reason: string };

/**
 * Import d'une place de marché pour chacun des jeux qu'elle sait coter — ou
 * pour les seuls `slugs` demandés. C'est ce que lance le cron.
 *
 * Un jeu en échec n'arrête pas les autres : un fichier de Cardmarket
 * indisponible pour un jeu ne doit pas priver tous les autres de leurs prix
 * du jour.
 */
export async function importAllPrices(source: CardPriceSource, slugs?: string[]): Promise<PriceImportRun[]> {
  const games = slugs ?? (await importableGameSlugs(source));
  const runs: PriceImportRun[] = [];

  for (const slug of games) {
    const log = (line: string) => console.info(`[prix ${source} ${slug}] ${line.trim()}`);

    try {
      runs.push(
        source === "cardmarket"
          ? await importCardmarketPrices({ slug, log })
          : await importCardnexusPrices({ slug, log, apiKey: process.env.CARDNEXUS_API_KEY })
      );
    } catch (error) {
      console.error(`[prix ${source} ${slug}] Import en échec :`, error);
      runs.push({ source, slug, status: "failed", reason: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const run of runs) {
    if (run.status === "rejected") {
      console.error(`[prix ${source} ${run.slug}] Import refusé par le garde-fou : ${run.reason}.`);
    }
  }

  return runs;
}
