/**
 * Listes de cartes au format texte, partagées par l'export et l'import des
 * paquets de cube :
 *
 * ```
 * 2x Nom de la carte #OGN001
 * 1x Nom de la carte
 * ```
 *
 * Le suffixe `#(setCode)(collectorNumber)` désigne une impression précise. Il
 * est toujours écrit à l'export et reste facultatif à l'import : une liste
 * copiée depuis un autre outil n'en porte généralement pas.
 */

/** Une ligne de liste, avant toute correspondance avec la base du jeu. */
export type CardListEntry = {
  quantity: number;
  name: string;
  /**
   * Code d'impression brut tel qu'il suit le `#` (`OGN001`). Extension et
   * numéro y sont collés sans séparateur : la coupure dépend du jeu, elle est
   * donc laissée à la résolution qui connaît les cartes.
   */
  printCode?: string;
};

export type ParsedCardList = {
  entries: CardListEntry[];
  /** Lignes non vides dont rien n'a pu être tiré, remontées telles quelles. */
  invalidLines: string[];
};

export type CardListCard = {
  name: string;
  setCode?: string;
  collectorNumber?: string;
};

/**
 * `2x Nom #OGN001`. La quantité est facultative (une carte par défaut) et
 * s'écrit aussi bien `2x`, `2` que `x2` ; le nom est tout ce qui reste une fois
 * le suffixe d'impression retiré.
 */
const LINE_PATTERN = /^(?:(?:(\d+)\s*[xX*]?|[xX*](\d+))\s+)?(.+?)(?:\s+#([^\s#]+))?$/;

/** Une liste peut porter des titres de section ou des annotations : ils ne sont pas des cartes. */
const COMMENT_PATTERN = /^(?:\/\/|#)/;

function entryKey(entry: CardListEntry): string {
  return `${entry.name.toLowerCase()}|${entry.printCode?.toUpperCase() ?? ""}`;
}

/**
 * Analyse une liste collée. Les quantités d'une même carte s'additionnent :
 * une liste peut répéter une carte ligne à ligne plutôt qu'indiquer son nombre
 * d'exemplaires.
 */
export function parseCardList(text: string): ParsedCardList {
  const entries: CardListEntry[] = [];
  const byKey = new Map<string, CardListEntry>();
  const invalidLines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || COMMENT_PATTERN.test(line)) {
      continue;
    }

    const match = line.match(LINE_PATTERN);
    const name = match?.[3]?.trim();
    if (!match || !name) {
      invalidLines.push(line);
      continue;
    }

    const quantity = Number.parseInt(match[1] ?? match[2] ?? "1", 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      invalidLines.push(line);
      continue;
    }

    const entry: CardListEntry = { quantity, name, ...(match[4] ? { printCode: match[4] } : {}) };
    const existing = byKey.get(entryKey(entry));
    if (existing) {
      existing.quantity += quantity;
    } else {
      byKey.set(entryKey(entry), entry);
      entries.push(entry);
    }
  }

  return { entries, invalidLines };
}

/** Code d'impression tel qu'écrit après le `#` : extension et numéro accolés. */
export function printCodeOf(card: CardListCard): string | undefined {
  if (!card.setCode && !card.collectorNumber) {
    return undefined;
  }

  return `${card.setCode ?? ""}${card.collectorNumber ?? ""}`;
}

/**
 * Comparaison des codes d'impression : ni la casse ni les séparateurs ne
 * comptent. `SOR-001`, `sor001` et `SOR001` désignent la même impression, que
 * l'écriture vienne de notre export, de l'identifiant de la carte ou d'une
 * saisie à la main.
 */
export function normalizePrintCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9*]/g, "");
}

/**
 * Coupures possibles d'un code d'impression en extension + numéro. Le format
 * les accole et rien ne dit où l'extension s'arrête : `OGN001` se coupe après
 * trois lettres, mais un numéro peut lui-même commencer par une lettre
 * (`SFDT01`). Toutes les coupures sont donc proposées, à la base de trancher.
 */
export function printCodeSplits(code: string): { setCode: string; collectorNumber: string }[] {
  const normalized = normalizePrintCode(code);
  if (normalized.length < 2 || normalized.length > 16) {
    return [];
  }

  return Array.from({ length: normalized.length - 1 }, (_, index) => ({
    setCode: normalized.slice(0, index + 1),
    collectorNumber: normalized.slice(index + 1),
  }));
}

/** Réécrit une entrée dans le format d'origine, pour la remonter telle quelle à l'utilisateur. */
export function formatCardListEntry(entry: CardListEntry): string {
  return `${entry.quantity}x ${entry.name}${entry.printCode ? ` #${entry.printCode}` : ""}`;
}

/**
 * Écrit une liste de cartes, un exemplaire par entrée en entrée comme en base :
 * les exemplaires d'une même impression sont regroupés sur une ligne, dans
 * l'ordre où la carte apparaît pour la première fois.
 */
export function formatCardList(cards: CardListCard[]): string {
  const lines = new Map<string, { card: CardListCard; quantity: number }>();

  for (const card of cards) {
    const key = `${card.name}|${printCodeOf(card) ?? ""}`;
    const existing = lines.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      lines.set(key, { card, quantity: 1 });
    }
  }

  return [...lines.values()]
    .map(({ card, quantity }) => formatCardListEntry({ quantity, name: card.name, printCode: printCodeOf(card) }))
    .join("\n");
}

/**
 * Liste d'un cube entier : les paquets se suivent, chacun annoncé par un titre
 * en commentaire. Les commentaires étant ignorés à l'analyse, le texte reste
 * réimportable tel quel dans un paquet.
 */
export function formatCubeCardList(packs: { label: string; cards: CardListCard[] }[]): string {
  return packs
    .map(({ label, cards }) => [`// ${label}`, formatCardList(cards)].filter(Boolean).join("\n"))
    .join("\n\n");
}
