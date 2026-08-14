/**
 * Import des prix Cardmarket.
 *
 * Cardmarket publie en accès libre (https://www.cardmarket.com/Data/Download)
 * la liste des cartes d'un jeu et son guide des prix, recalculé une fois par
 * jour. Ce script télécharge ces deux fichiers, rapproche leurs produits des
 * cartes de la plateforme, et écrit un relevé par carte reconnue.
 *
 * Le relevé est un instantané : il est réécrit à chaque exécution, il n'y a ni
 * historique ni mise à jour continue — l'import se lance à la main, quand on
 * veut rafraîchir les prix. Cf. docs/CARD_PRICES.md.
 *
 * Usage (depuis la racine du dépôt) :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/prices/import-cardmarket.ts [--game fab] [--dry-run] [--expansions]
 *
 * `--conditions=react-server` est nécessaire parce que `lib/mongodb` importe
 * `server-only`, et le hook résout l'alias `@/` de tsconfig.json hors bundler.
 *
 * - `--game <slug>` : jeu à traiter, `fab` par défaut ;
 * - `--dry-run` : rapproche et affiche le bilan sans rien écrire en base ;
 * - `--expansions` : détaille la correspondance déduite entre les extensions
 *   de Cardmarket et les nôtres, extension par extension.
 *
 * Variable d'environnement : `MONGODB_URI`.
 */
import { ObjectId } from "mongodb";
import db from "../../lib/mongodb.ts";
import { ensureCardPriceIndexes, upsertCardPrices } from "../../lib/db/card-prices.ts";
import {
  CARDMARKET_GAME_IDS,
  fetchCardmarketPriceGuide,
  fetchCardmarketProducts,
  parseCardmarketDate,
  type CardmarketPriceGuide,
} from "../../lib/prices/cardmarket.ts";
import {
  CARDMARKET_GAME_PROFILES,
  matchCardmarketProducts,
  type PriceableCard,
} from "../../lib/prices/cardmarket-matching.ts";
import { buildCardPrice } from "../../lib/prices/cardmarket-prices.ts";
import type { CardPrice } from "../../lib/types/card-price.ts";

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
 * Cartes du jeu telles que le rapprochement les lit : leur identité, et les
 * seuls attributs dont le profil du jeu a besoin pour distinguer deux cartes
 * de même nom.
 */
async function loadCards(gameId: ObjectId, attributeKeys: readonly string[]): Promise<PriceableCard[]> {
  const projection = {
    _id: 0,
    id: 1,
    name: 1,
    setCode: 1,
    ...Object.fromEntries(attributeKeys.map((key) => [key, 1])),
  };

  const docs = await db.collection<PriceableCard>("cards").find({ gameId }, { projection }).toArray();

  return docs.filter((card) => typeof card.id === "string" && typeof card.name === "string");
}

function percent(part: number, total: number): string {
  return total > 0 ? `${((100 * part) / total).toFixed(1)} %` : "—";
}

async function main() {
  const args = process.argv.slice(2);
  const slug = argValue(args, "--game") ?? "fab";
  const dryRun = args.includes("--dry-run");
  const showExpansions = args.includes("--expansions");

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

  console.info(`Cartes du jeu « ${slug} » (${gameId})...`);
  const cards = await loadCards(gameId, profile.attributeKeys);
  console.info(`${cards.length} cartes en base.`);

  console.info(`Téléchargement du catalogue et des prix Cardmarket (jeu ${cardmarketGameId})...`);
  const [productFile, priceFile] = await Promise.all([
    fetchCardmarketProducts(cardmarketGameId),
    fetchCardmarketPriceGuide(cardmarketGameId),
  ]);
  console.info(
    `${productFile.products.length} produits (${productFile.createdAt}), ` +
      `${priceFile.priceGuides.length} lignes de prix (${priceFile.createdAt}).`
  );

  const { matches, expansions, skipped } = matchCardmarketProducts(productFile.products, cards, profile);

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
  console.info(
    `\nExtensions Cardmarket reconnues : ${mappedExpansions.length}/${expansions.length}. ` +
      `Produits écartés : ${skipped.unknownCard} sans carte de ce nom, ` +
      `${skipped.unmappedExpansion} sans extension reconnue, ${skipped.ambiguous} ambigus.`
  );

  if (showExpansions) {
    for (const expansion of [...expansions].sort((a, b) => a.idExpansion - b.idExpansion)) {
      const recognized = expansion.setCodes
        .map((match) => `${match.setCode} (${(100 * match.score).toFixed(0)} %, ${match.common} cartes)`)
        .join(", ");
      console.info(`  exp ${expansion.idExpansion} — ${expansion.products} produits → ${recognized || "non reconnue"}`);
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
      `dont ${prices.length} avec au moins un prix.`
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
