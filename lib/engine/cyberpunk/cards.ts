/**
 * Correspondance entre les cartes Cyberpunk TCG du catalogue Joutes et celles
 * du moteur.
 *
 * Le moteur reprend les identifiants du catalogue (`WNC-001`, `WNC-005a`,
 * `PRM01-004a`). Les tirages « Beta » ont leur propre code d'extension au
 * catalogue (`WNCB-005a`, voir `scripts/games/cyberpunk/import-cards.ts`) : ce
 * sont les mêmes cartes, que le moteur connaît sous le code de l'extension.
 */

import type { CpColor, CpKind } from "@/lib/engine/cyberpunk/types";

/** Les extensions dont le catalogue range un tirage Beta à part. */
const BETA_SETS: Record<string, string> = { WNCB: "WNC", EPSB: "EPS", THSB: "THS" };

/**
 * Le code moteur d'une carte du catalogue. `known` dit si le moteur connaît un
 * code : un identifiant qu'il ne connaît pas, même ramené à l'extension, rend
 * `null`.
 */
export function toCpCode(cardId: string, known: (code: string) => boolean): string | null {
  const id = cardId.trim();
  if (known(id)) return id;
  const dash = id.indexOf("-");
  if (dash > 0) {
    const set = BETA_SETS[id.slice(0, dash).toUpperCase()];
    const code = set ? `${set}${id.slice(dash)}` : null;
    if (code && known(code)) return code;
  }
  return null;
}

/** Ce que la table affiche d'une carte : catalogue Joutes et moteur réunis. */
export type CpTableCard = {
  code: string;
  /** Le numéro de la carte dans le moteur (le `def` de ses évènements). */
  def: number;
  /** « V, Streetkid ». */
  name: string;
  /** Le nom sans le sous-titre : celui que le moteur écrit dans ses phrases. */
  title: string;
  kind: CpKind;
  color: CpColor;
  image?: string;
  text?: string;
  cost: number | null;
  power: number | null;
  ram: number;
  sell: boolean;
  tags: string[];
  /** Faux pour une carte que le moteur ne sait pas jouer. */
  playable: boolean;
};

export type CpTableCards = Record<string, CpTableCard>;

/** La couleur de chaque couleur de carte, pour les pastilles. */
export const COLOR_HEX: Record<CpColor, string> = {
  red: "#e0464f",
  blue: "#3f8ff0",
  green: "#3fbf6a",
  yellow: "#f2c230",
};

/** Ce que la liste des decks lit d'une Légende : nom, vignette, couleur. */
export function cpPickerCards(cards: CpTableCards): Record<string, { name: string; image?: string; domains: string[] }> {
  return Object.fromEntries(
    Object.values(cards).map((card) => [card.code, { name: card.name, image: card.image, domains: [card.color] }]),
  );
}

/** Ce que `autoLegends` lit d'une Légende. */
export type LegendInfo = { code: string; title: string; color: CpColor };

/**
 * Les trois Légendes d'un deck automatique autour de `first` : deux autres de
 * noms différents (règle 3.20.2), de sa couleur quand il y en a assez, pour
 * que la RAM de cette couleur suffise au deck. `pick` tire un élément d'une liste.
 */
export function autoLegends(
  first: string,
  legends: LegendInfo[],
  pick: <T>(list: T[]) => T,
): string[] | null {
  const chosen = legends.find((legend) => legend.code === first);
  if (!chosen) return null;
  const out: LegendInfo[] = [chosen];
  const free = () => legends.filter((legend) => !out.some((taken) => taken.title === legend.title));
  while (out.length < 3) {
    const pool = free();
    if (pool.length === 0) return null;
    const same = pool.filter((legend) => legend.color === chosen.color);
    out.push(pick(same.length > 0 ? same : pool));
  }
  return out.map((legend) => legend.code);
}

/** Un morceau d'une phrase du moteur : du texte, ou le nom d'une carte à mettre en valeur. */
export type CpTextPart = { text: string; card?: string };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Une phrase du moteur, découpée pour l'affichage : les noms des cartes qu'elle
 * cite (`codes`) sont rendus à part. Un nom n'est reconnu qu'entier : « V » ne
 * se lit pas dans « Valentino ».
 */
export function splitCpText(text: string, codes: Iterable<string>, cards: CpTableCards): CpTextPart[] {
  const known = [...new Set(codes)]
    .map((code) => cards[code])
    .filter((card): card is CpTableCard => Boolean(card?.title))
    // Le plus long d'abord : le nom complet avant le nom seul.
    .flatMap((card) => (card.name !== card.title ? [{ card, text: card.name }, { card, text: card.title }] : [{ card, text: card.title }]))
    .sort((a, b) => b.text.length - a.text.length);
  if (known.length === 0) return [{ text }];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${known.map((entry) => escapeRegExp(entry.text)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const parts: CpTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    const entry = known.find((candidate) => candidate.text === match[0]);
    parts.push(entry ? { text: match[0], card: entry.card.code } : { text: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
