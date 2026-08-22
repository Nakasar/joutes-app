import type { CardmarketProduct } from "@/lib/prices/cardmarket";
import type { PriceableCard } from "@/lib/types/card-price";

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

export type { PriceableCard };

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

/**
 * Jeu dont le nom de carte suffit à identifier la carte dans son extension.
 * C'est le cas de la plupart : Cardmarket écrit le nom complet, sous-titre
 * compris (`Darth Vader, Dark Lord of the Sith`), comme la plateforme.
 */
const NAME_ONLY_PROFILE: CardmarketGameProfile = {
  attributeKeys: [],
  productKey: normalizeCardName,
  cardKey: (card) => normalizeCardName(card.name),
};

/**
 * Star Wars Unlimited : le catalogue est importé du site officiel en français
 * (`scripts/games/swu/import-cards.ts`), quand Cardmarket nomme ses produits
 * en anglais. C'est donc le nom anglais rapporté par l'import qui est comparé.
 * Les cartes importées avant qu'il ne le soit retombent sur leur nom : elles
 * ne ressortiront que si les deux langues l'écrivent pareil.
 */
const SWU_PROFILE: CardmarketGameProfile = {
  attributeKeys: ["englishName"],
  productKey: normalizeCardName,
  cardKey: (card) =>
    normalizeCardName(typeof card.englishName === "string" && card.englishName ? card.englishName : card.name),
};

/** Jeu dont on sait rapprocher les cartes des produits Cardmarket. */
export const CARDMARKET_GAME_PROFILES: Record<string, CardmarketGameProfile> = {
  fab: FAB_PROFILE,
  riftbound: NAME_ONLY_PROFILE,
  swu: SWU_PROFILE,
};

/**
 * Ordre des numéros de collection, celui du jeu : `9` avant `10`, et une
 * variante après le numéro dont elle est tirée (`027` avant `027a`). Une
 * comparaison de chaînes classerait `10` avant `9`, et un `parseInt` ne
 * distinguerait plus `027` de `027a`.
 */
export function compareCollectorNumbers(left: string, right: string): number {
  const parts = (value: string) => value.toLowerCase().match(/\d+|\D+/g) ?? [];
  const [a, b] = [parts(left), parts(right)];

  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const [x, y] = [a[index], b[index]];

    // Le plus court d'abord : `027` est le numéro de base de `027a`.
    if (x === undefined) return -1;
    if (y === undefined) return 1;

    const numeric = /^\d/.test(x) && /^\d/.test(y);
    if (numeric && Number(x) !== Number(y)) return Number(x) - Number(y);
    if (!numeric && x !== y) return x < y ? -1 : 1;
  }

  return 0;
}

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
  /** Produits attribués par l'ordre des numéros, faute de nom distinctif. */
  paired: number;
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
 * En dessous de ce recouvrement, l'extension Cardmarket n'est qu'un morceau de
 * la nôtre (des promos, une réimpression partielle) et l'ordre de ses produits
 * ne suit plus celui de nos numéros : les variantes n'y sont pas appariées.
 * Au-dessus, l'ordre se vérifie sur 99 % des cartes sans homonyme.
 */
const MIN_PAIRING_SCORE = 0.7;

/**
 * Variantes d'un même nom appariées par l'ordre : Cardmarket numérote ses
 * produits dans l'ordre des numéros de collection, ce qui se vérifie sur les
 * cartes sans homonyme d'une extension — le tirage de base avant sa version
 * showcase, `027` avant `027a`. Faute de quoi ni l'un ni l'autre n'aurait de
 * prix : leurs noms sont identiques des deux côtés.
 *
 * L'appariement demande **autant** de produits que de cartes : s'il en manque
 * un, tout le groupe est écarté plutôt que décalé d'un cran.
 */
function pairByCollectorNumber(
  products: CardmarketProduct[],
  cards: PriceableCard[]
): [PriceableCard, CardmarketProduct][] | undefined {
  if (products.length !== cards.length || cards.some((card) => !card.collectorNumber)) {
    return undefined;
  }

  const sortedCards = [...cards].sort((a, b) =>
    compareCollectorNumbers(a.collectorNumber as string, b.collectorNumber as string)
  );
  const sortedProducts = [...products].sort((a, b) => a.idProduct - b.idProduct);

  return sortedCards.map((card, index) => [card, sortedProducts[index]]);
}

/**
 * Produits Cardmarket rapprochés des cartes de la plateforme.
 *
 * Le rapprochement se fait par groupe — tous les produits d'une extension qui
 * portent le même nom, face à toutes les cartes de l'extension reconnue qui le
 * portent aussi — parce que c'est le nombre de part et d'autre qui dit ce que
 * ces produits sont :
 *
 * - une seule carte, plusieurs produits : ce sont ses tirages (normal, rainbow
 *   foil, cold foil, réédition), et rien dans les fichiers de Cardmarket ne dit
 *   lequel est lequel — ils sont tous rattachés à la carte, à charge pour
 *   l'appelant d'en tirer un prix de référence ;
 * - autant de cartes que de produits : ce sont ses variantes, qui sont chez
 *   nous autant de numéros de collection — elles sont appariées dans l'ordre ;
 * - tout le reste est ambigu, et n'est pas deviné.
 */
export function matchCardmarketProducts(
  products: CardmarketProduct[],
  cards: PriceableCard[],
  profile: CardmarketGameProfile
): CardmarketMatchReport {
  const expansions = inferExpansionMappings(products, cards, profile);

  const cardsBySetAndKey = new Map<string, Map<string, PriceableCard[]>>();
  const knownKeys = new Set<string>();
  for (const card of cards) {
    const key = profile.cardKey(card);
    knownKeys.add(key);

    if (!card.setCode) {
      continue;
    }
    const byKey = cardsBySetAndKey.get(card.setCode) ?? new Map<string, PriceableCard[]>();
    byKey.set(key, [...(byKey.get(key) ?? []), card]);
    cardsBySetAndKey.set(card.setCode, byKey);
  }

  const productsByExpansion = groupBy(products, (product) => product.idExpansion);

  const matches = new Map<string, CardmarketProduct[]>();
  const skipped = { unknownCard: 0, unmappedExpansion: 0, ambiguous: 0 };
  let paired = 0;

  const attach = (card: PriceableCard, product: CardmarketProduct) => {
    matches.set(card.id, [...(matches.get(card.id) ?? []), product]);
  };

  for (const expansion of expansions) {
    const groups = groupBy(productsByExpansion.get(expansion.idExpansion) ?? [], (product) =>
      profile.productKey(product.name)
    );

    for (const [key, group] of groups) {
      // Les extensions candidates sont déjà classées par recouvrement
      // décroissant : la première qui porte ce nom est la mieux reconnue.
      const candidates = expansion.setCodes
        .map(({ setCode, score }) => ({ score, cards: cardsBySetAndKey.get(setCode)?.get(key) ?? [] }))
        .filter((candidate) => candidate.cards.length > 0);

      if (candidates.length === 0) {
        skipped[knownKeys.has(key) ? "unmappedExpansion" : "unknownCard"] += group.length;
        continue;
      }

      // Deux extensions aussi bien reconnues l'une que l'autre : choisir
      // reviendrait à tirer au sort l'impression que l'on date.
      if (candidates.filter((candidate) => candidate.score === candidates[0].score).length > 1) {
        skipped.ambiguous += group.length;
        continue;
      }

      const { cards: candidateCards, score } = candidates[0];

      if (candidateCards.length === 1) {
        for (const product of group) {
          attach(candidateCards[0], product);
        }
        continue;
      }

      const pairs = score >= MIN_PAIRING_SCORE ? pairByCollectorNumber(group, candidateCards) : undefined;

      if (!pairs) {
        skipped.ambiguous += group.length;
        continue;
      }

      for (const [card, product] of pairs) {
        attach(card, product);
      }
      paired += group.length;
    }
  }

  return { matches, expansions, paired, skipped };
}
