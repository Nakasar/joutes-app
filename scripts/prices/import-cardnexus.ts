/**
 * Import des prix CardNexus.
 *
 * CardNexus publie, sous clé d'API, trois « feeds » par jeu : ses extensions,
 * son catalogue de produits et les prix courants de chacun
 * (https://docs.cardnexus.com/feeds). Ce script les télécharge, rapproche les
 * produits des cartes de la plateforme — par extension et numéro de collection,
 * pas par ressemblance de noms — et écrit un relevé par carte reconnue.
 *
 * Le relevé est un instantané : il est réécrit à chaque exécution, il n'y a ni
 * historique ni mise à jour continue — l'import se lance à la main, quand on
 * veut rafraîchir les prix. Il cohabite avec celui de Cardmarket : les deux
 * fournisseurs écrivent chacun leur relevé, et l'application choisit ensuite
 * lequel montrer, carte par carte. Cf. docs/CARD_PRICES.md.
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/prices/import-cardnexus.ts [--game riftbound] [--dry-run] [--sets]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - `--game <slug>` : jeu à traiter, `riftbound` par défaut ;
 * - `--dry-run` : rapproche et affiche le bilan sans rien écrire en base ;
 * - `--sets` : détaille les extensions, une par ligne, la moins couverte en tête.
 *
 * Variables d'environnement : `MONGODB_URI` et `CARDNEXUS_API_KEY`.
 */
import { ObjectId } from "mongodb";
import db from "../../lib/mongodb.ts";
import { ensureCardPriceIndexes, upsertCardPrices } from "../../lib/db/card-prices.ts";
import {
  CARDNEXUS_GAME_IDS,
  type CardnexusExpansion,
  type CardnexusFinishPrices,
  type CardnexusPriceRecord,
  type CardnexusProduct,
} from "../../lib/prices/cardnexus.ts";
import { fetchCardnexusFeeds, streamCardnexusFeed } from "../../lib/prices/cardnexus-feed.ts";
import { CARDNEXUS_GAME_PROFILES, matchCardnexusProducts } from "../../lib/prices/cardnexus-matching.ts";
import { buildCardnexusPrice } from "../../lib/prices/cardnexus-prices.ts";
import type { CardPrice, PriceableCard } from "../../lib/types/card-price.ts";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
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
 * Cartes du jeu telles que le rapprochement les lit : leur identité, leur
 * extension et leur numéro de collection — c'est tout ce dont il a besoin.
 */
async function loadCards(gameId: ObjectId): Promise<PriceableCard[]> {
  const docs = await db
    .collection<PriceableCard>("cards")
    .find({ gameId }, { projection: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1 } })
    .toArray();

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

async function main() {
  const args = process.argv.slice(2);
  const slug = argValue(args, "--game") ?? "riftbound";
  const dryRun = args.includes("--dry-run");
  const showSets = args.includes("--sets");

  const cardnexusGameId = CARDNEXUS_GAME_IDS[slug];
  const apiKey = process.env.CARDNEXUS_API_KEY;

  if (!cardnexusGameId) {
    throw new Error(
      `Le jeu « ${slug} » n'a pas d'identifiant CardNexus connu : ajoutez-le à CARDNEXUS_GAME_IDS (lib/prices/cardnexus.ts).`
    );
  }

  if (!apiKey) {
    throw new Error("CARDNEXUS_API_KEY est absente : les feeds CardNexus ne sont pas publics.");
  }

  const gameId = await resolveGameId(slug);

  console.info(`Cartes du jeu « ${slug} » (${gameId})...`);
  const { cards, dropped } = withUniqueIds(await loadCards(gameId));
  console.info(
    `${cards.length} cartes en base` +
      (dropped > 0 ? `, ${dropped} écartées : leur identifiant en désigne plusieurs.` : ".")
  );

  console.info(`Feeds CardNexus du jeu « ${cardnexusGameId} »...`);
  const feeds = await fetchCardnexusFeeds(cardnexusGameId, apiKey);
  console.info(
    `catalogue ${feeds.catalog.recordCount} produits (${feeds.catalog.generatedAt}), ` +
      `${feeds.expansions.recordCount} extensions, ` +
      `prix ${feeds.prices.recordCount} produits (${feeds.prices.generatedAt}).`
  );

  const expansions = await collect(streamCardnexusFeed<CardnexusExpansion>(feeds.expansions));
  const products = await collect(streamCardnexusFeed<CardnexusProduct>(feeds.catalog));

  const { matches, expansions: setReports, skipped } = matchCardnexusProducts(
    products,
    expansions,
    cards,
    CARDNEXUS_GAME_PROFILES[slug]
  );

  // Les prix ne sont gardés que pour les produits rapprochés : le feed en
  // couvre tout le jeu, produits scellés compris, et le reste ne sera jamais lu.
  const matchedProductIds = new Set([...matches.values()].flat().map((product) => product.id));
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

  const prices = [...matches].flatMap<CardPrice>(([cardId, cardProducts]) => {
    const price = buildCardnexusPrice(cardId, cardProducts, pricesByProduct, { sourceUpdatedAt, updatedAt });
    return price ? [price] : [];
  });

  // --- Bilan ------------------------------------------------------------

  const namedSets = setReports.filter((set) => set.setCode);
  console.info(
    `\nExtensions CardNexus : ${namedSets.length}/${setReports.length} portent un code. ` +
      `Produits écartés : ${skipped.sealed} scellés, ` +
      `${skipped.unknownExpansion} sans extension reconnue, ` +
      `${skipped.noPrintNumber} sans numéro de collection, ` +
      `${skipped.unknownCard} sans carte à ce numéro, ` +
      `${skipped.ambiguous} ambigus (deux cartes au même numéro).`
  );

  if (showSets) {
    for (const set of [...setReports].sort((a, b) => a.matched / a.products - b.matched / b.products)) {
      console.info(
        `  ${set.setCode ?? "sans code"} — ${set.name} : ` +
          `${set.matched}/${set.products} produits rapprochés (${percent(set.matched, set.products)})`
      );
    }
  }

  const missingBySet = new Map<string, number>();
  for (const card of cards) {
    if (!matches.has(card.id)) {
      const setCode = card.setCode ?? "—";
      missingBySet.set(setCode, (missingBySet.get(setCode) ?? 0) + 1);
    }
  }

  console.info(
    `Cartes rapprochées : ${matches.size}/${cards.length} (${percent(matches.size, cards.length)}), ` +
      `dont ${prices.length} avec au moins un prix en euros.`
  );

  const worstSets = [...missingBySet].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (worstSets.length > 0) {
    console.info(
      `Extensions les moins couvertes : ${worstSets.map(([setCode, count]) => `${setCode} (${count})`).join(", ")}.`
    );
  }

  // --- Écriture ---------------------------------------------------------

  if (dryRun) {
    console.info("\n--dry-run : rien n'a été écrit en base.");
    return;
  }

  await ensureCardPriceIndexes();
  const { written } = await upsertCardPrices(gameId, prices);
  console.info(`\n${prices.length} relevés écrits (${written} créés ou modifiés).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
