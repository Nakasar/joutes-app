import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents";
import type { DeckZone, DeckZoneKey } from "@/lib/decks/zones";

/**
 * La « carte de visite » d'un deck : sa liste sur une image au format d'une
 * carte à jouer (63 × 88 mm), à partager ou à glisser dans un protège-carte.
 *
 * Ce module ne dessine rien. Il décide **quoi** mettre sur la carte et **où** :
 * l'identité du deck (légende, domaines, champion choisi), les sections de la
 * liste et leur répartition sur deux colonnes, et la taille des lignes qui
 * laisse tout tenir. Le dessin est dans `business-card-image.tsx` ; le garder
 * à part permet de vérifier la mise en page sans rendre d'image.
 *
 * Les mesures sont en pixels d'une carte de 750 × 1 048 ; l'image est rendue
 * au double.
 */

export type BusinessCardStyle = "illustrated" | "sober";

export const BUSINESS_CARD_STYLES: BusinessCardStyle[] = ["illustrated", "sober"];

/** La carte, en pixels de mise en page : 63 × 88 mm. */
export const BUSINESS_CARD_SIZE = { width: 750, height: 1048 } as const;

/** Le facteur de rendu : 1 500 × 2 096 px, nets à l'impression d'une carte. */
export const BUSINESS_CARD_SCALE = 2;

export type BusinessCardLine = {
  quantity: number;
  name: string;
  cost?: number;
};

export type BusinessCardSection = {
  key: string;
  title: string;
  count: number;
  lines: BusinessCardLine[];
  /** Les cartes qui n'ont pas tenu sur la carte : « + N autres ». */
  hidden: number;
};

export type BusinessCardChip = {
  label: string;
  quantity?: number;
  domain?: string;
};

/** Hauteur d'une ligne de carte et taille de sa police, de la plus aérée à la plus serrée. */
export const BUSINESS_CARD_DENSITIES = [
  { row: 25, font: 16 },
  { row: 22, font: 14.5 },
  { row: 19.5, font: 13 },
] as const;

export type BusinessCardDensity = (typeof BUSINESS_CARD_DENSITIES)[number];

export type BusinessCardLayout = {
  style: BusinessCardStyle;
  /** Libellé au-dessus du titre : « Légende », ou « Deck » quand le jeu n'en a pas. */
  kicker: string;
  title: string;
  /** Le nom du deck et son auteur, sous le titre ; absent si on l'a masqué. */
  subtitle?: string;
  gameName?: string;
  domains: string[];
  /** L'illustration du bandeau (style illustré). */
  art?: { image: string; legend: boolean };
  champion?: { name: string; cost?: number; image?: string };
  columns: [BusinessCardSection[], BusinessCardSection[]];
  /** Pastilles en bas de la seconde colonne : les runes de Riftbound. */
  chips?: { title: string; count: number; items: BusinessCardChip[] };
  density: BusinessCardDensity;
  /** Le lien du QR code, quand il y en a un. */
  qrUrl?: string;
  /** « 40 + 1 cartes · réserve 7 ». */
  footer: string;
};

export type BusinessCardInput = {
  deck: {
    name: string;
    creatorName?: string;
    legendCardId?: string;
    domains?: string[];
    cards?: DeckCards;
    coverImage?: string;
  };
  gameName?: string;
  gameSlug?: string;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
  style: BusinessCardStyle;
  showName: boolean;
  /** Absent : pas de QR code (un deck privé, ou le choix du joueur). */
  qrUrl?: string;
};

/** Les types de Riftbound, dans l'ordre et sous le nom où la carte les montre. */
const RIFTBOUND_TYPES: { type: string; title: string }[] = [
  { type: "unit", title: "Unités" },
  { type: "spell", title: "Sorts" },
  { type: "gear", title: "Équipement" },
];

const COLORLESS = "colorless";

// Hauteurs fixes de la carte, en pixels de mise en page (voir le rendu).
const FRAME_HEIGHT = BUSINESS_CARD_SIZE.height - 2 * 18 - 3;
const HEADER_HEIGHT: Record<BusinessCardStyle, number> = { illustrated: 282, sober: 168 };
const CHAMPION_HEIGHT = 80;
const LISTS_MARGIN = 14;
const FOOTER_HEIGHT = 67;
const SECTION_HEADER = 26;
const SECTION_GAP = 12;
const CHIPS_HEIGHT = 64;
const QR_HEIGHT = 100;

/** Le premier type de la carte qui compte pour la ranger. */
function cardTypes(card: DeckCardInfo | undefined): string[] {
  if (!card) return [];
  return [...(card.types ?? []), card.type ?? ""].map((type) => type.toLowerCase()).filter(Boolean);
}

/**
 * Les lignes d'une liste : une par nom, triées par coût puis par nom.
 *
 * Deux impressions de la même carte n'ont rien à faire sur deux lignes d'une
 * carte de visite : on lit un nom, pas une extension.
 */
export function businessCardLines(
  entries: { cardId: string; quantity: number }[],
  cardsById: Map<string, DeckCardInfo>,
  { withCost = true }: { withCost?: boolean } = {}
): BusinessCardLine[] {
  const byName = new Map<string, BusinessCardLine>();
  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    const card = cardsById.get(entry.cardId);
    const name = card?.name || entry.cardId;
    const line = byName.get(name);
    if (line) {
      line.quantity += entry.quantity;
    } else {
      byName.set(name, {
        quantity: entry.quantity,
        name,
        cost: withCost && typeof card?.cost === "number" ? card.cost : undefined,
      });
    }
  }

  return [...byName.values()].sort(
    (a, b) => (a.cost ?? Number.POSITIVE_INFINITY) - (b.cost ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name)
  );
}

function section(key: string, title: string, lines: BusinessCardLine[]): BusinessCardSection {
  return { key, title, count: lines.reduce((total, line) => total + line.quantity, 0), lines, hidden: 0 };
}

/**
 * Le deck principal, découpé par type : unités, sorts, équipement à Riftbound ;
 * à un autre jeu, ses propres types, du plus représenté au moins représenté.
 */
function mainSections(
  entries: { cardId: string; quantity: number }[],
  cardsById: Map<string, DeckCardInfo>,
  riftbound: boolean
): BusinessCardSection[] {
  const groups = new Map<string, { title: string; entries: typeof entries }>();
  for (const entry of entries) {
    const types = cardTypes(cardsById.get(entry.cardId));
    const known = riftbound ? RIFTBOUND_TYPES.find((item) => types.includes(item.type)) : undefined;
    const raw = cardsById.get(entry.cardId)?.type;
    const key = known?.type ?? (riftbound ? "other" : (raw ?? "other").toLowerCase());
    const title = known?.title ?? (riftbound || !raw ? "Autres" : raw);
    const group = groups.get(key) ?? { title, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  const sections = [...groups.entries()].map(([key, group]) =>
    section(`main:${key}`, group.title, businessCardLines(group.entries, cardsById))
  );

  if (riftbound) {
    const rank = (key: string) => {
      const index = RIFTBOUND_TYPES.findIndex((item) => `main:${item.type}` === key);
      return index === -1 ? RIFTBOUND_TYPES.length : index;
    };
    return sections.sort((a, b) => rank(a.key) - rank(b.key));
  }
  // « Autres » ferme la marche, quel que soit son compte.
  return sections.sort((a, b) => Number(a.key === "main:other") - Number(b.key === "main:other") || b.count - a.count);
}

/** La hauteur d'une colonne de sections, lignes comprises. */
export function columnHeight(sections: BusinessCardSection[], row: number, extra = 0): number {
  const blocks = sections.map((item) => SECTION_HEADER + (item.lines.length + (item.hidden > 0 ? 1 : 0)) * row);
  const parts = extra > 0 ? [...blocks, extra] : blocks;
  return parts.reduce((total, height) => total + height, 0) + Math.max(parts.length - 1, 0) * SECTION_GAP;
}

/**
 * Répartit les sections sur deux colonnes, pour une hauteur de ligne donnée.
 *
 * L'ordre de lecture est gardé — on descend la première colonne, puis la
 * seconde — et la coupure tombe là où les deux colonnes sont le plus près de
 * la même hauteur, le bloc du bas de la seconde (runes, QR code) compris.
 */
export function splitColumns(
  sections: BusinessCardSection[],
  rightExtra: number,
  row: number = BUSINESS_CARD_DENSITIES[0].row
): [BusinessCardSection[], BusinessCardSection[]] {
  if (sections.length === 0) return [[], []];
  let best = 1;
  let bestHeight = Number.POSITIVE_INFINITY;
  for (let cut = 1; cut <= sections.length; cut++) {
    const height = Math.max(
      columnHeight(sections.slice(0, cut), row),
      columnHeight(sections.slice(cut), row, rightExtra)
    );
    if (height < bestHeight) {
      best = cut;
      bestHeight = height;
    }
  }
  return [sections.slice(0, best), sections.slice(best)];
}

/**
 * Coupe les plus longues sections jusqu'à ce que la colonne tienne, en
 * remplaçant ce qui dépasse par une ligne « + N autres ».
 */
function trimColumn(sections: BusinessCardSection[], row: number, available: number, extra: number) {
  const trimmed = sections.map((item) => ({ ...item, lines: [...item.lines] }));
  while (columnHeight(trimmed, row, extra) > available) {
    const longest = trimmed.reduce<BusinessCardSection | undefined>(
      (pick, item) => (item.lines.length > 1 && (!pick || item.lines.length > pick.lines.length) ? item : pick),
      undefined
    );
    if (!longest) break;
    const dropped = longest.lines.pop()!;
    longest.hidden += dropped.quantity;
  }
  return trimmed;
}

/** La hauteur que les colonnes peuvent occuper, une fois l'en-tête, le champion et le pied posés. */
export function listsHeight(style: BusinessCardStyle, withChampion: boolean): number {
  return FRAME_HEIGHT - HEADER_HEIGHT[style] - (withChampion ? CHAMPION_HEIGHT : 0) - LISTS_MARGIN - FOOTER_HEIGHT;
}

export function buildBusinessCard(input: BusinessCardInput): BusinessCardLayout {
  const { deck, zones, cardsById, style } = input;
  const riftbound = input.gameSlug === "riftbound";
  const entriesOf = (key: DeckZoneKey) => (deck.cards?.[key] ?? []).filter((entry) => entry.quantity > 0);
  const zoneKeys = new Set(zones.map((zone) => zone.key));

  // L'identité : la légende quand le jeu en a une, sinon le nom du deck.
  const legendEntry = zoneKeys.has("legend") ? entriesOf("legend")[0] : undefined;
  const legendId = legendEntry?.cardId ?? deck.legendCardId;
  const legend = legendId ? cardsById.get(legendId) : undefined;
  const byLine = deck.creatorName ? `${deck.name} · par ${deck.creatorName}` : deck.name;
  const title = legend?.name ?? deck.name;
  const subtitle = input.showName ? (legend ? byLine : deck.creatorName ? `par ${deck.creatorName}` : undefined) : undefined;

  const domains = (legend?.domain?.length ? legend.domain : (deck.domains ?? [])).filter(
    (domain) => domain.toLowerCase() !== COLORLESS
  );

  const championEntry = zoneKeys.has("champions") ? entriesOf("champions")[0] : undefined;
  const championCard = championEntry ? cardsById.get(championEntry.cardId) : undefined;
  const champion = championEntry
    ? { name: championCard?.name ?? championEntry.cardId, cost: championCard?.cost, image: championCard?.image }
    : undefined;

  const art = legend?.image
    ? { image: legend.image, legend: true }
    : deck.coverImage
      ? { image: deck.coverImage, legend: false }
      : undefined;

  // La liste : le deck principal par type, puis les autres zones du jeu.
  const sections: BusinessCardSection[] = [];
  let chips: BusinessCardLayout["chips"];
  for (const zone of zones) {
    const entries = entriesOf(zone.key);
    if (zone.key === "legend" || zone.key === "champions") continue;
    if (entries.length === 0) continue;
    if (zone.curve) {
      sections.push(...mainSections(entries, cardsById, riftbound));
    } else if (riftbound && zone.key === "runes") {
      // Douze runes de deux domaines : des pastilles, pas une liste.
      const lines = businessCardLines(entries, cardsById, { withCost: false });
      chips = {
        title: zone.label,
        count: lines.reduce((total, line) => total + line.quantity, 0),
        items: lines.map((line) => {
          const card = [...cardsById.values()].find((item) => item.name === line.name);
          return {
            label: line.name.replace(/\s+Rune$/i, ""),
            quantity: line.quantity,
            domain: card?.domain?.find((domain) => domain.toLowerCase() !== COLORLESS),
          };
        }),
      };
    } else {
      const title = riftbound && zone.key === "battlefields" ? "Champs de bataille" : zone.label;
      const withCost = !(riftbound && zone.key === "battlefields");
      sections.push(section(zone.key, title, businessCardLines(entries, cardsById, { withCost })));
    }
  }

  // À Riftbound, la réserve suit le deck principal et passe avant les champs
  // de bataille : c'est la suite de la liste, eux sont à part.
  const ordered = riftbound
    ? [
        ...sections.filter((item) => item.key.startsWith("main:")),
        ...sections.filter((item) => item.key === "sideboard"),
        ...sections.filter((item) => !item.key.startsWith("main:") && item.key !== "sideboard"),
      ]
    : sections;

  const rightExtra = (chips ? CHIPS_HEIGHT + SECTION_GAP : 0) + (input.qrUrl ? QR_HEIGHT + SECTION_GAP : 0);
  const available = listsHeight(style, Boolean(champion));

  // La ligne la plus aérée qui laisse tout tenir, avec la coupure qui lui va ;
  // sinon la plus serrée, et ce qui dépasse encore devient « + N autres ».
  let density: BusinessCardDensity = BUSINESS_CARD_DENSITIES[BUSINESS_CARD_DENSITIES.length - 1];
  let columns: [BusinessCardSection[], BusinessCardSection[]] | undefined;
  for (const candidate of BUSINESS_CARD_DENSITIES) {
    const [left, right] = splitColumns(ordered, rightExtra, candidate.row);
    if (columnHeight(left, candidate.row) <= available && columnHeight(right, candidate.row, rightExtra) <= available) {
      density = candidate;
      columns = [left, right];
      break;
    }
  }
  if (!columns) {
    const [left, right] = splitColumns(ordered, rightExtra, density.row);
    columns = [trimColumn(left, density.row, available, 0), trimColumn(right, density.row, available, rightExtra)];
  }

  return {
    style,
    kicker: legend ? "Légende" : "Deck",
    title,
    subtitle,
    gameName: input.gameName,
    domains,
    art,
    champion,
    columns,
    chips,
    density,
    qrUrl: input.qrUrl,
    footer: businessCardFooter(deck.cards, zones),
  };
}

/** « 40 + 1 cartes · réserve 7 » : le deck principal comme la fiche le compte, puis la réserve. */
export function businessCardFooter(cards: DeckCards | undefined, zones: DeckZone[]): string {
  const count = (key: DeckZoneKey) => (cards?.[key] ?? []).reduce((total, entry) => total + entry.quantity, 0);
  const main = zones.find((zone) => zone.curve);
  const parts: string[] = [];
  if (main) {
    const contributing = zones.filter((zone) => zone.countsTowards === main.key).map((zone) => count(zone.key));
    const extra = contributing.reduce((total, value) => total + value, 0);
    const total = count(main.key) + extra;
    parts.push(extra > 0 ? `${count(main.key)} + ${extra} cartes` : `${total} carte${total > 1 ? "s" : ""}`);
  }
  if (zones.some((zone) => zone.key === "sideboard")) {
    const reserve = count("sideboard");
    if (reserve > 0) parts.push(`réserve ${reserve}`);
  }
  return parts.join(" · ");
}

/** Le nom du fichier téléchargé : « carte-le-zoo-d-ivern.png ». */
export function businessCardFilename(deckName: string): string {
  const slug = deckName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `carte-${slug || "deck"}.png`;
}

export function parseBusinessCardStyle(value: string | null | undefined): BusinessCardStyle {
  return value === "sober" ? "sober" : "illustrated";
}
