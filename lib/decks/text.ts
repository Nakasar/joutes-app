import type { DeckCardEntry, DeckCards } from "@/lib/decks/contents";
import { defaultDeckZone, type DeckZone, type DeckZoneKey } from "@/lib/decks/zones";

/**
 * Liste de deck en texte : « Légende : » puis « 2 Nom de carte » par ligne.
 *
 * C'est le format que le vérificateur de deck de Riftbound lit et écrit déjà
 * (`app/[locale]/(app)/games/riftbound/deck-checker/utils.ts`) et celui que les
 * joueurs collent depuis les autres sites. La lecture est donc volontairement
 * permissive — `3x Carte`, `- Carte`, en-têtes avec ou sans deux-points — et
 * l'écriture, elle, ne produit qu'une seule forme.
 *
 * Les en-têtes reconnus sortent des zones du jeu, plus quelques synonymes
 * anglais : personne ne retape « Deck principal » quand son export dit
 * « MainDeck ».
 */
const ZONE_ALIASES: Record<string, DeckZoneKey> = {
  legend: "legend",
  legends: "legend",
  "légende": "legend",
  "légendes": "legend",
  champion: "champions",
  champions: "champions",
  "chosen champion": "champions",
  "champion choisi": "champions",
  deck: "maindeck",
  main: "maindeck",
  maindeck: "maindeck",
  "main deck": "maindeck",
  "main-deck": "maindeck",
  "deck principal": "maindeck",
  principal: "maindeck",
  rune: "runes",
  runes: "runes",
  battlefield: "battlefields",
  battlefields: "battlefields",
  "champs de bataille": "battlefields",
  side: "sideboard",
  sideboard: "sideboard",
  "réserve": "sideboard",
  reserve: "sideboard",
  extra: "extra",
  "zone extra": "extra",
};

function normalizeHeader(value: string): string {
  return value.trim().replace(/:$/, "").trim().toLowerCase();
}

export type ParsedDeckLine = {
  zone: DeckZoneKey;
  name: string;
  quantity: number;
  /**
   * Vrai quand aucun en-tête ne précédait la ligne : sa zone est celle par
   * défaut, faute de mieux, et le rangement par type peut la corriger.
   */
  inferred?: boolean;
};

export type ParsedDeckText = {
  lines: ParsedDeckLine[];
  /** Zones dont un en-tête a été reconnu, dans l'ordre d'apparition. */
  sections: DeckZoneKey[];
  /** Lignes qui n'ont pu être lues ni comme en-tête ni comme carte. */
  ignored: string[];
};

/**
 * Lit une liste collée.
 *
 * Une ligne rencontrée avant tout en-tête va dans la zone principale du jeu :
 * une liste sans section reste la façon la plus courante de coller un deck.
 */
export function parseDeckText(text: string, zones: DeckZone[]): ParsedDeckText {
  const known = new Map<string, DeckZoneKey>();
  for (const zone of zones) {
    known.set(zone.label.toLowerCase(), zone.key);
    known.set(zone.short.toLowerCase(), zone.key);
    known.set(zone.key, zone.key);
  }
  for (const [alias, key] of Object.entries(ZONE_ALIASES)) {
    if (zones.some((zone) => zone.key === key)) {
      known.set(alias, key);
    }
  }

  const lines: ParsedDeckLine[] = [];
  const sections: DeckZoneKey[] = [];
  const ignored: string[] = [];
  let current = defaultDeckZone(zones);
  let headed = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const headerMatch = line.match(/^([\p{L}\p{M} '\-]+):?$/u);
    if (headerMatch) {
      const zone = known.get(normalizeHeader(headerMatch[1]));
      if (zone) {
        current = zone;
        headed = true;
        if (!sections.includes(zone)) {
          sections.push(zone);
        }
        continue;
      }
    }

    const { quantity, name } = readCardLine(line);

    if (!name || quantity <= 0) {
      ignored.push(line);
      continue;
    }

    // Deux lignes pour la même carte dans la même zone se fondent : les exports
    // qui listent les exemplaires un par un ne doivent pas créer de doublons.
    const existing = lines.find(
      (entry) => entry.zone === current && entry.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      lines.push({ zone: current, name, quantity, ...(headed ? {} : { inferred: true }) });
    }
  }

  return { lines, sections, ignored };
}

/** Une ligne de carte : « 3x Carte », « - Carte »… Le préfixe est ce qui précède le nom. */
function readCardLine(line: string): { quantity: number; name: string; prefix: string } {
  const quantityMatch = line.match(/^(\s*[xX\-*]*?(\d+)\s*x?\s+)(.+)$/);
  if (quantityMatch) {
    return { quantity: Number.parseInt(quantityMatch[2], 10), name: quantityMatch[3].trim(), prefix: quantityMatch[1] };
  }

  const bullet = line.match(/^(\s*[-•]?\s*)(.*)$/);
  return { quantity: 1, name: (bullet?.[2] ?? line).trim(), prefix: bullet?.[1] ?? "" };
}

/**
 * Renomme une carte dans une liste collée : seules les lignes dont le nom
 * **est** `from` changent, quantité et puce gardées. Comparer la fin de ligne
 * réécrirait aussi « Thunder Strike » en corrigeant « Strike ».
 */
export function renameDeckTextCard(text: string, from: string, to: string): string {
  const target = normalizeCardName(from);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const { name, prefix } = readCardLine(line.trim());
      return name && normalizeCardName(name) === target ? `${prefix}${to}` : line;
    })
    .join("\n");
}

/** Écrit le contenu d'un deck sous la forme lue par `parseDeckText`. */
export function stringifyDeckText(
  cards: DeckCards | undefined,
  zones: DeckZone[],
  nameOf: (cardId: string) => string | undefined
): string {
  const blocks: string[] = [];

  for (const zone of zones) {
    const entries = cards?.[zone.key] ?? [];
    if (entries.length === 0) continue;

    const rendered = entries
      .map((entry) => ({ name: nameOf(entry.cardId), quantity: entry.quantity }))
      .filter((entry): entry is { name: string; quantity: number } => Boolean(entry.name))
      .map((entry) => `${entry.quantity} ${entry.name}`);

    if (rendered.length === 0) continue;

    blocks.push([`${zone.label} :`, ...rendered].join("\n"));
  }

  return blocks.join("\n\n");
}

export type DeckTextApplication = {
  cards: DeckCards;
  /** Lignes appariées à une carte du catalogue. */
  matched: number;
  /** Noms lus qu'aucune carte du catalogue ne porte. */
  unmatched: string[];
  /** Nombre de lignes fusionnées parce qu'elles nommaient la même carte. */
  merged: number;
};

/**
 * Transforme une liste collée en contenu de deck, en appariant chaque nom au
 * catalogue.
 *
 * L'appariement est insensible à la casse et aux accents : un nom recopié à la
 * main d'un site tiers ne porte pas toujours ses diacritiques, et refuser la
 * ligne pour un accent manquant ferait passer l'outil pour cassé.
 */
export function applyDeckText(
  parsed: ParsedDeckText,
  resolve: (name: string) => string | undefined,
  /**
   * Zone d'une ligne sans en-tête, d'après la carte appariée et ce qui est
   * déjà rangé : une liste collée sans sections met sa légende et ses runes
   * à leur place plutôt que dans le deck principal.
   */
  route?: (cardId: string, cards: DeckCards) => DeckZoneKey
): DeckTextApplication {
  const cards: DeckCards = {};
  const unmatched: string[] = [];
  let matched = 0;
  let merged = 0;

  for (const line of parsed.lines) {
    const cardId = resolve(line.name);
    if (!cardId) {
      // Une fois par nom : le même nom inconnu dans deux sections reste une
      // seule faute à corriger.
      if (!unmatched.includes(line.name)) unmatched.push(line.name);
      continue;
    }

    matched += 1;

    const add = (zone: DeckZoneKey, quantity: number) => {
      const entries: DeckCardEntry[] = cards[zone] ?? [];
      const existing = entries.find((entry) => entry.cardId === cardId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        entries.push({ cardId, quantity });
      }
      cards[zone] = entries;
      return Boolean(existing);
    };

    if (line.inferred && route) {
      // Exemplaire par exemplaire : « 3 Jinx » sans en-tête donne un champion
      // choisi et deux cartes du deck principal, pas trois champions choisis.
      if (add(route(cardId, cards), 1)) merged += 1;
      for (let copy = 1; copy < line.quantity; copy += 1) {
        add(route(cardId, cards), 1);
      }
    } else if (add(line.zone, line.quantity)) {
      merged += 1;
    }
  }

  return { cards, matched, unmatched, merged };
}

/** Clé de rapprochement d'un nom de carte : sans casse, sans accents, sans espaces superflus. */
export function normalizeCardName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ce qu'une liste appliquée change dans le deck en cours, zone par zone.
 *
 * Une zone nommée par un en-tête est remplacée : c'est ce que dit la liste.
 * La zone par défaut l'est aussi quand des lignes sans en-tête y tombent,
 * comme avant le rangement par type. Une zone que seul le rangement atteint
 * — une rune ou un champion égaré dans une liste sans sections — reçoit ces
 * cartes **en plus** de ce qu'elle porte : coller trois sorts et une rune ne
 * doit pas effacer les onze autres.
 */
export function mergeDeckText(
  current: DeckCards,
  applied: DeckCards,
  parsed: ParsedDeckText,
  zones: DeckZone[]
): DeckCards {
  const replaced = replacedDeckZones(parsed, zones);
  const changes: DeckCards = {};
  for (const [key, entries] of Object.entries(applied) as [DeckZoneKey, DeckCardEntry[]][]) {
    changes[key] = replaced.has(key) ? entries : combineEntries(current[key] ?? [], entries);
  }

  return changes;
}

/** Les zones qu'une liste appliquée remplace, plutôt que de les compléter (voir `mergeDeckText`). */
export function replacedDeckZones(parsed: ParsedDeckText, zones: DeckZone[]): Set<DeckZoneKey> {
  const replaced = new Set<DeckZoneKey>(parsed.sections);
  if (parsed.lines.some((line) => line.inferred)) {
    replaced.add(defaultDeckZone(zones));
  }
  return replaced;
}

/** Ce qui reste du deck en cours une fois les zones remplacées vidées : le contexte du rangement. */
export function keptDeckCards(current: DeckCards, parsed: ParsedDeckText, zones: DeckZone[]): DeckCards {
  const replaced = replacedDeckZones(parsed, zones);
  return Object.fromEntries(
    Object.entries(current).filter(([key]) => !replaced.has(key as DeckZoneKey))
  ) as DeckCards;
}

/** Les deux listes d'une même zone réunies, les quantités d'une même carte additionnées. */
export function combineEntries(a: DeckCardEntry[], b: DeckCardEntry[]): DeckCardEntry[] {
  const combined = a.map((entry) => ({ ...entry }));
  for (const entry of b) {
    const existing = combined.find((other) => other.cardId === entry.cardId);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      combined.push({ ...entry });
    }
  }
  return combined;
}

/** Deux contenus de deck réunis zone par zone. */
export function combineDeckCards(a: DeckCards, b: DeckCards): DeckCards {
  const combined: DeckCards = { ...a };
  for (const [key, entries] of Object.entries(b) as [DeckZoneKey, DeckCardEntry[]][]) {
    combined[key] = combineEntries(a[key] ?? [], entries);
  }
  return combined;
}
