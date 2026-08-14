import type { CardmarketProduct } from "@/lib/prices/cardmarket";

/**
 * Rapprochement des produits Cardmarket et des cartes de la plateforme.
 *
 * Les deux catalogues n'ont aucun identifiant en commun : le fichier de
 * Cardmarket ne donne d'une carte que son nom, son extension (un simple
 * numéro, sans nom) et sa catégorie — ni code d'extension, ni numéro de
 * collection. Le rapprochement se fait donc sur le nom, l'extension servant à
 * choisir entre les réimpressions d'une même carte.
 *
 * Comme les extensions Cardmarket ne sont pas nommées, leur correspondance
 * avec nos codes d'extension est déduite du catalogue lui-même : une extension
 * Cardmarket et une extension de la plateforme qui partagent l'essentiel de
 * leurs noms de cartes sont la même. Cette déduction est refaite à chaque
 * import — elle suit donc les ajouts de Cardmarket sans entretien — et le
 * script d'import en publie le détail pour qu'elle reste vérifiable.
 *
 * Ce qui n'est pas rapproché n'est pas deviné : une carte dont le nom ne
 * ressort pas, ou dont l'extension reste ambiguë, n'a simplement pas de prix.
 */

export type PriceableCard = {
  /** Identifiant de la carte au sein du jeu (`WTR020`). */
  id: string;
  name: string;
  setCode?: string;
  /** Attributs de jeu utiles au rapprochement (le pitch en Flesh and Blood). */
  [key: string]: unknown;
};

/**
 * Ce qui distingue deux cartes de même nom dans un jeu donné. Cardmarket
 * l'écrit dans le nom de ses produits, la plateforme le porte en attribut :
 * le profil traduit les deux dans une même clé.
 */
export type CardmarketGameProfile = {
  /** Attributs de carte lus par `cardKey`, pour ne charger que ceux-là. */
  attributeKeys: readonly string[];
  productKey(productName: string): string;
  cardKey(card: PriceableCard): string;
};

/** Les noms se comparent sans casse, sans accent ni ponctuation. */
export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Couleur de pitch écrite entre parenthèses par Cardmarket, vers la valeur
 * numérique portée par les cartes. Les fautes de frappe (« Yelllow », « Bleu »)
 * sont celles du catalogue de Cardmarket : quelques dizaines de produits en
 * dépendent, et les corriger ici coûte moins qu'un prix manquant.
 */
const FAB_PITCH_BY_COLOR: Record<string, number> = {
  red: 1,
  yellow: 2,
  blue: 3,
  yelllow: 2,
  bleu: 3,
};

function fabKey(name: string, pitch: number | undefined): string {
  return `${normalizeCardName(name)}|${pitch ?? ""}`;
}

/**
 * Flesh and Blood : une même carte existe en trois versions de pitch (rouge,
 * jaune, bleu) qui sont trois cartes distinctes, de numéros de collection
 * différents. Cardmarket les distingue par un suffixe de couleur.
 */
const FAB_PROFILE: CardmarketGameProfile = {
  attributeKeys: ["pitch"],
  productKey(productName) {
    const parenthesis = productName.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    const pitch = parenthesis && FAB_PITCH_BY_COLOR[parenthesis[2].toLowerCase()];

    // Une parenthèse qui n'est pas une couleur connue fait partie du nom :
    // la carte ne sera rapprochée que d'une carte qui la porte aussi.
    return pitch ? fabKey(parenthesis[1], pitch) : fabKey(productName, undefined);
  },
  cardKey(card) {
    return fabKey(card.name, typeof card.pitch === "number" ? card.pitch : undefined);
  },
};

/** Jeu dont on sait rapprocher les cartes des produits Cardmarket. */
export const CARDMARKET_GAME_PROFILES: Record<string, CardmarketGameProfile> = {
  fab: FAB_PROFILE,
};

/** Extension de la plateforme reconnue derrière une extension Cardmarket. */
export type ExpansionSetMatch = {
  setCode: string;
  /** Noms de cartes communs aux deux extensions. */
  common: number;
  /** Recouvrement des deux extensions, entre 0 et 1 (moyenne harmonique). */
  score: number;
};

export type CardmarketExpansionMapping = {
  idExpansion: number;
  products: number;
  /** Extensions candidates, la mieux reconnue en tête. */
  setCodes: ExpansionSetMatch[];
};

/**
 * En dessous de ce recouvrement, deux extensions n'ont en commun que des noms
 * de cartes qui circulent partout (promos, rééditions) : les rapprocher
 * daterait des prix de la mauvaise impression.
 */
const MIN_EXPANSION_SCORE = 0.1;

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return groups;
}

/**
 * Extensions de la plateforme reconnues derrière chaque extension Cardmarket.
 *
 * Le recouvrement est mesuré dans les deux sens : une extension Cardmarket
 * dont toutes les cartes sont dans une de nos extensions ne lui correspond que
 * si l'inverse est vrai aussi — sans quoi le deck de démarrage d'un héros
 * « correspondrait » parfaitement à l'extension complète dont il est tiré.
 *
 * Plusieurs extensions Cardmarket peuvent désigner la même extension de la
 * plateforme (première édition et Unlimited d'un même bloc), et une extension
 * Cardmarket peut en recouvrir plusieurs (les rééditions promotionnelles) :
 * toutes les candidates au-dessus du seuil sont donc conservées.
 */
export function inferExpansionMappings(
  products: CardmarketProduct[],
  cards: PriceableCard[],
  profile: CardmarketGameProfile
): CardmarketExpansionMapping[] {
  const setKeys = new Map<string, Set<string>>();
  for (const card of cards) {
    if (!card.setCode) {
      continue;
    }
    const keys = setKeys.get(card.setCode) ?? new Set<string>();
    keys.add(profile.cardKey(card));
    setKeys.set(card.setCode, keys);
  }

  return [...groupBy(products, (product) => product.idExpansion)].map(([idExpansion, expansionProducts]) => {
    const keys = new Set(expansionProducts.map((product) => profile.productKey(product.name)));

    const setCodes: ExpansionSetMatch[] = [];
    for (const [setCode, cardKeys] of setKeys) {
      let common = 0;
      for (const key of keys) {
        if (cardKeys.has(key)) {
          common++;
        }
      }

      if (common === 0) {
        continue;
      }

      const recall = common / keys.size;
      const precision = common / cardKeys.size;
      const score = (2 * recall * precision) / (recall + precision);

      if (score >= MIN_EXPANSION_SCORE) {
        setCodes.push({ setCode, common, score });
      }
    }

    setCodes.sort((a, b) => b.score - a.score || a.setCode.localeCompare(b.setCode));

    return { idExpansion, products: expansionProducts.length, setCodes };
  });
}

export type CardmarketMatchReport = {
  /** Produits Cardmarket retenus, par identifiant de carte. */
  matches: Map<string, CardmarketProduct[]>;
  expansions: CardmarketExpansionMapping[];
  skipped: {
    /** Aucune carte de la plateforme ne porte ce nom. */
    unknownCard: number;
    /** L'extension Cardmarket n'a pas été reconnue, ou pas pour cette carte. */
    unmappedExpansion: number;
    /** Plusieurs cartes également plausibles : aucune n'est choisie. */
    ambiguous: number;
  };
};

/**
 * Produits Cardmarket rapprochés des cartes de la plateforme.
 *
 * Une carte peut recevoir plusieurs produits — Cardmarket vend le tirage
 * normal, le rainbow foil et le cold foil d'un même numéro comme trois
 * produits — et rien dans ses fichiers ne dit lequel est lequel : ils sont donc
 * tous conservés, à charge pour l'appelant d'en tirer un prix de référence.
 */
export function matchCardmarketProducts(
  products: CardmarketProduct[],
  cards: PriceableCard[],
  profile: CardmarketGameProfile
): CardmarketMatchReport {
  const expansions = inferExpansionMappings(products, cards, profile);
  const scoresByExpansion = new Map(
    expansions.map(({ idExpansion, setCodes }) => [
      idExpansion,
      new Map(setCodes.map((match) => [match.setCode, match.score])),
    ])
  );

  const cardsByKey = groupBy(cards, (card) => profile.cardKey(card));

  const matches = new Map<string, CardmarketProduct[]>();
  const skipped = { unknownCard: 0, unmappedExpansion: 0, ambiguous: 0 };

  for (const product of products) {
    const named = cardsByKey.get(profile.productKey(product.name));
    if (!named) {
      skipped.unknownCard++;
      continue;
    }

    const scores = scoresByExpansion.get(product.idExpansion);
    const candidates = named.filter((card) => card.setCode && scores?.has(card.setCode));
    if (candidates.length === 0) {
      skipped.unmappedExpansion++;
      continue;
    }

    // Deux cartes de même nom dans deux extensions également reconnues (ou
    // dans la même extension, réimprimées sous deux numéros) : leur donner à
    // toutes les deux le prix serait aussi faux que de choisir au hasard.
    const best = Math.max(...candidates.map((card) => scores?.get(card.setCode as string) ?? 0));
    const winners = candidates.filter((card) => (scores?.get(card.setCode as string) ?? 0) === best);
    if (winners.length > 1) {
      skipped.ambiguous++;
      continue;
    }

    const cardId = winners[0].id;
    matches.set(cardId, [...(matches.get(cardId) ?? []), product]);
  }

  return { matches, expansions, skipped };
}
