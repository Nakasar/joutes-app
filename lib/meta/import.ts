import "server-only";

import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import {
  getDeckFromPiltover,
  getDeckFromPiltoverCode,
  type DeckList,
} from "@/app/[locale]/(app)/games/riftbound/deck-checker/action";
import { listLegendCards, resolveCardIdsByName } from "@/lib/db/deck-cards";
import { deckLegality, zoneCount, type DeckCardInfo, type DeckCards } from "@/lib/decks/contents";
import { computeDeckDomains } from "@/lib/decks/domains";
import { routeCardToZone } from "@/lib/decks/routing";
import { applyDeckText, normalizeCardName, parseDeckText, type ParsedDeckText } from "@/lib/decks/text";
import { getDeckZones, type DeckZone, type DeckZoneKey } from "@/lib/decks/zones";
import type { Game } from "@/lib/types/Game";
import { deckFingerprint, looseCardKey } from "@/lib/meta/fingerprint";
import { formatPlacement, splitMetaImportInput, type MetaImportEntry } from "@/lib/meta/import-input";
import { inferLegendAndChampion, locatorDeckToParsed } from "@/lib/meta/locator";
import { fetchLocatorDeck } from "@/lib/meta/locator-api";

/** Les jeux dont les liens et codes Piltover Archive se lisent. */
const PILTOVER_GAME_SLUGS = new Set(["riftbound"]);

/** Au-delà, un collage se découpe en plusieurs imports : chaque lien coûte un appel à Piltover Archive. */
export const MAX_META_IMPORT_ENTRIES = 64;

/** Un collage de plus de `MAX_META_IMPORT_ENTRIES` decks : refusé entier plutôt que tronqué en silence. */
export class MetaImportTooLargeError extends Error {
  constructor(readonly entries: number) {
    super(
      `${entries} decks dans le collage : ${MAX_META_IMPORT_ENTRIES} au plus par import. Coupez-le en plusieurs fois.`
    );
    this.name = "MetaImportTooLargeError";
  }
}

/** Appels simultanés à Piltover Archive. */
const FETCH_CONCURRENCY = 4;

export type MetaImportStatus = "ready" | "warning" | "duplicate" | "error";

export type MetaImportRow = {
  /** Position de l'entrée dans le collage, à partir de 0. */
  index: number;
  line: number;
  kind: MetaImportEntry["kind"];
  /** Ce que l'administrateur a collé, raccourci, pour reconnaître la ligne. */
  label: string;
  status: MetaImportStatus;
  /** Ce qui justifie l'état : noms rapprochés, zones incomplètes, doublon, erreur. */
  notes: string[];
  /** Le nom que portera le deck. */
  name?: string;
  legend?: { id: string; name: string; image?: string };
  domains: string[];
  /** Compte de chaque zone du jeu, et si sa règle est respectée. */
  zones: { key: DeckZoneKey; label: string; count: number; compliant: boolean }[];
  placement?: string;
  pilot?: string;
  sourceRef?: string;
  url?: string;
  /** Le deck déjà en base dont celui-ci est le doublon. */
  duplicateOf?: { deckId: string; name: string } | { line: number };
  /** Contenu lu, gardé côté serveur pour l'écriture ; jamais renvoyé au navigateur. */
  cards?: DeckCards;
  contentHash?: string;
};

export type MetaImportOptions = {
  source: string;
};

type ReadEntry = {
  parsed?: ParsedDeckText;
  error?: string;
  sourceRef?: string;
  url?: string;
};

/** Range une section de liste Piltover Archive dans la zone du jeu qui lui correspond. */
const PILTOVER_SECTIONS: Record<keyof DeckList, DeckZoneKey> = {
  legends: "legend",
  champions: "champions",
  maindeck: "maindeck",
  runes: "runes",
  battlefields: "battlefields",
  sideboard: "sideboard",
};

function deckListToParsed(deck: DeckList, zones: DeckZone[]): ParsedDeckText {
  const lines: ParsedDeckText["lines"] = [];
  const sections: DeckZoneKey[] = [];

  for (const [section, zone] of Object.entries(PILTOVER_SECTIONS) as [keyof DeckList, DeckZoneKey][]) {
    if (!zones.some((candidate) => candidate.key === zone)) continue;
    for (const card of deck[section] ?? []) {
      if (!card.name || card.quantity <= 0) continue;
      lines.push({ zone, name: card.name, quantity: card.quantity });
      if (!sections.includes(zone)) sections.push(zone);
    }
  }

  return { lines, sections, ignored: [] };
}

async function readEntry(entry: MetaImportEntry, game: Game, zones: DeckZone[]): Promise<ReadEntry> {
  const piltover = PILTOVER_GAME_SLUGS.has(game.slug ?? "");

  try {
    switch (entry.kind) {
      case "piltover-link":
        if (!piltover) return { error: "Les liens Piltover Archive ne valent que pour Riftbound." };
        return {
          parsed: deckListToParsed(await getDeckFromPiltover(entry.deckId), zones),
          sourceRef: entry.deckId,
          url: entry.url,
        };
      case "piltover-code":
        if (!piltover) return { error: "Les codes Piltover Archive ne valent que pour Riftbound." };
        return { parsed: deckListToParsed(await getDeckFromPiltoverCode(entry.code), zones), sourceRef: entry.code };
      case "list":
        return { parsed: parseDeckText(entry.text, zones) };
      case "locator-deck":
        return {
          parsed: locatorDeckToParsed(await fetchLocatorDeck(entry.deckId), zones, entry.legendName),
          sourceRef: `locator:${entry.deckId}`,
          url: entry.eventUrl,
        };
      case "invalid":
        return { error: entry.reason };
    }
  } catch (error) {
    console.warn("Import de deck méta impossible :", error);
    return {
      error:
        entry.kind === "list"
          ? "Liste illisible."
          : entry.kind === "locator-deck"
            ? "Le locator n'a pas rendu ce deck (pas de réponse, ou liste non publiée)."
            : "Deck introuvable sur Piltover Archive (lien ou code erroné, ou deck privé).",
    };
  }
}

/** `items.map(task)` avec au plus `limit` tâches en cours. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function entryLabel(entry: MetaImportEntry): string {
  switch (entry.kind) {
    case "piltover-link":
      return entry.url;
    case "piltover-code":
      return entry.code.length > 24 ? `${entry.code.slice(0, 24)}…` : entry.code;
    case "list": {
      const first = entry.text.split(/\r?\n/).find((line) => line.trim()) ?? "";
      return `Liste : ${first.trim().slice(0, 60)}`;
    }
    case "locator-deck":
      return `Locator · ${entry.pilot ?? entry.deckId}`;
    case "invalid":
      return entry.raw.slice(0, 80);
  }
}

/** Le nom court d'une légende : « Jinx » pour « Jinx, Loose Cannon ». */
function shortLegendName(name: string): string {
  return name.split(",")[0].trim();
}

export function metaDeckName(legendName: string | undefined, source: string, placement?: string): string {
  return [legendName ? shortLegendName(legendName) : "Deck", source, formatPlacement(placement)]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 90);
}

/**
 * Apparie les noms au catalogue du jeu : d'abord comme l'éditeur de deck (sans
 * casse ni accents), puis, pour les noms restés sans carte, sans ponctuation
 * ni espaces. Rend les rapprochements faits par la seconde passe, pour que
 * l'écran de vérification les montre.
 */
async function resolveNames(
  gameId: string,
  names: string[]
): Promise<{ byName: Map<string, DeckCardInfo>; approximations: Map<string, string> }> {
  const byName = await resolveCardIdsByName(gameId, names);
  const approximations = new Map<string, string>();

  const missing = names.filter((name) => !byName.has(normalizeCardName(name)));
  if (missing.length === 0 || !ObjectId.isValid(gameId)) {
    return { byName, approximations };
  }

  const catalogNames = await db.collection("cards").distinct("name", { gameId: new ObjectId(gameId) });
  // Une clé que deux cartes partagent ne rapproche rien : mieux vaut une carte
  // inconnue, que l'administrateur corrige, qu'une carte choisie au hasard.
  const byLooseKey = new Map<string, string | null>();
  for (const name of catalogNames) {
    if (typeof name !== "string") continue;
    const key = looseCardKey(name);
    const known = byLooseKey.get(key);
    byLooseKey.set(key, known === undefined || known === name ? name : null);
  }

  const candidates = new Map<string, string>();
  for (const name of missing) {
    const match = byLooseKey.get(looseCardKey(name));
    if (match) candidates.set(name, match);
  }

  if (candidates.size > 0) {
    const found = await resolveCardIdsByName(gameId, [...new Set(candidates.values())]);
    for (const [name, match] of candidates) {
      const card = found.get(normalizeCardName(match));
      if (card) {
        byName.set(normalizeCardName(name), card);
        approximations.set(name, card.name);
      }
    }
  }

  return { byName, approximations };
}

/**
 * Lit, apparie et vérifie chaque deck d'un collage, sans rien écrire.
 *
 * C'est la même fonction qui sert la vérification et l'import : l'import la
 * relance plutôt que de faire confiance à un contenu renvoyé par le navigateur.
 */
export async function resolveMetaImport(
  game: Game,
  input: string | MetaImportEntry[],
  options: MetaImportOptions
): Promise<MetaImportRow[]> {
  const zones = getDeckZones(game);
  const entries = typeof input === "string" ? splitMetaImportInput(input) : input;
  if (entries.length > MAX_META_IMPORT_ENTRIES) {
    throw new MetaImportTooLargeError(entries.length);
  }
  const read = await mapWithConcurrency(entries, FETCH_CONCURRENCY, (entry) => readEntry(entry, game, zones));

  const names = [...new Set(read.flatMap((item) => item.parsed?.lines.map((line) => line.name) ?? []))];
  const { byName, approximations } = await resolveNames(game.id, names);

  // Le deck du locator ne porte ni la légende (lue dans son classement, à
  // défaut déduite) ni le champion choisi (déduit) : ils s'ajoutent à la liste lue.
  const inferenceNotes = new Map<number, string[]>();
  if (entries.some((entry) => entry.kind === "locator-deck")) {
    const legends = await listLegendCards(game.id);
    const cardOf = (name: string) => byName.get(normalizeCardName(name));
    entries.forEach((entry, index) => {
      const parsed = read[index].parsed;
      if (entry.kind !== "locator-deck" || !parsed) return;
      const { legend, champion, notes } = inferLegendAndChampion(parsed, cardOf, legends);
      if (legend) {
        byName.set(normalizeCardName(legend.name), legend);
        parsed.lines.unshift({ zone: "legend", name: legend.name, quantity: 1 });
      }
      if (champion) parsed.lines.splice(legend ? 1 : 0, 0, { zone: "champions", name: champion.name, quantity: 1 });
      if (notes.length > 0) inferenceNotes.set(index, notes);
    });
  }

  const byId = new Map([...byName.values()].map((card) => [card.id, card]));

  const rows: MetaImportRow[] = entries.map((entry, index) => {
    const item = read[index];
    const base: MetaImportRow = {
      index,
      line: entry.line,
      kind: entry.kind,
      label: entryLabel(entry),
      status: "ready",
      notes: [],
      domains: [],
      zones: [],
      placement: formatPlacement(entry.placement),
      pilot: entry.pilot,
      sourceRef: item.sourceRef,
      url: item.url,
    };

    if (!item.parsed || item.error) {
      return { ...base, status: "error", notes: [item.error ?? "Deck illisible."] };
    }

    const applied = applyDeckText(
      item.parsed,
      (name) => byName.get(normalizeCardName(name))?.id,
      (cardId, built) => {
        const card = byId.get(cardId);
        return card ? routeCardToZone(card, zones, built) : "maindeck";
      }
    );

    if (applied.matched === 0) {
      return { ...base, status: "error", notes: ["Aucune carte reconnue."] };
    }

    const notes: string[] = [...(inferenceNotes.get(index) ?? [])];
    const approximated = [...new Set(item.parsed.lines.map((line) => line.name))].filter((name) => approximations.has(name));
    for (const name of approximated) {
      notes.push(`« ${name} » rapproché de ${approximations.get(name)}`);
    }
    if (applied.unmatched.length > 0) {
      notes.push(`Cartes inconnues, ignorées : ${applied.unmatched.join(", ")}`);
    }

    const legality = deckLegality(applied.cards, zones);
    // Le locator ne publie ni les champs de bataille ni le champion choisi : leur
    // absence (et le deck principal à qui manque alors le champion) ne se
    // signale pas à chaque deck, l'écran le dit une fois pour toutes.
    const championMissing = zoneCount(applied.cards, "champions") === 0;
    const unpublished = (zone: DeckZone, count: number) =>
      entry.kind === "locator-deck" &&
      ((zone.key === "battlefields" || zone.key === "champions") && count === 0
        ? true
        : zone.key === "maindeck" && championMissing && zone.min !== undefined && count === zone.min - 1);
    for (const row of legality) {
      if (!row.compliant && !unpublished(row.zone, row.count)) notes.push(`${row.zone.label} : ${row.count} (${row.zone.rule})`);
    }

    const legendEntry = applied.cards.legend?.[0];
    const legend = legendEntry ? byId.get(legendEntry.cardId) : undefined;
    // La règle des decks enregistrés : ceux de la légende, à défaut ceux des cartes.
    const domains = computeDeckDomains(applied.cards, (cardId) => byId.get(cardId)?.domain);

    return {
      ...base,
      status: notes.length > 0 ? "warning" : "ready",
      notes,
      name: metaDeckName(legend?.name, options.source, entry.placement),
      ...(legend ? { legend: { id: legend.id, name: legend.name, image: legend.image } } : {}),
      domains,
      zones: legality.map((row) => ({
        key: row.zone.key,
        label: row.zone.label,
        count: row.count,
        compliant: row.compliant,
      })),
      cards: applied.cards,
      contentHash: deckFingerprint(applied.cards, (cardId) => byId.get(cardId)?.name),
    };
  });

  await markDuplicates(game.id, rows, options.source);
  return rows;
}

/**
 * Un doublon est la même liste relevée deux fois : le même deck Piltover
 * Archive, ou le même contenu dans la même source. Deux joueurs d'un même
 * tournoi peuvent jouer la même liste — c'est alors de la méta, pas un
 * doublon. Dans un même collage, deux listes identiques sans classement ni
 * joueur pour les distinguer sont donc importées toutes deux, mais signalées :
 * l'administrateur retire la ligne du collage si c'en est bien un.
 *
 * Face à la base, seuls les decks importés comptent : un deck de joueur
 * marqué peut encore changer, son contenu ne prouve rien.
 */
async function markDuplicates(gameId: string, rows: MetaImportRow[], source: string) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "error" || !row.contentHash) continue;
    const keys = [row.sourceRef && `ref:${row.sourceRef}`, `hash:${row.contentHash}:${row.pilot ?? ""}:${row.placement ?? ""}`].filter(
      (key): key is string => Boolean(key)
    );
    const earlier = keys.map((key) => seen.get(key)).find((line) => line !== undefined);
    const sameRef = Boolean(row.sourceRef && seen.has(`ref:${row.sourceRef}`));
    if (earlier !== undefined && !sameRef && !row.pilot && !row.placement) {
      if (row.status === "ready") row.status = "warning";
      row.notes = [...row.notes, `Même liste que la ligne ${earlier}, sans classement ni joueur : importée aussi. Retirez-la du collage si c'est un doublon.`];
      continue;
    }
    if (earlier !== undefined) {
      row.status = "duplicate";
      row.duplicateOf = { line: earlier };
      row.notes = [`Même liste que la ligne ${earlier} : ignorée.`];
      continue;
    }
    for (const key of keys) seen.set(key, row.line);
  }

  const candidates = rows.filter((row) => row.status !== "error" && row.status !== "duplicate" && row.contentHash);
  if (candidates.length === 0) return;

  const refs = candidates.map((row) => row.sourceRef).filter((ref): ref is string => Boolean(ref));
  const hashes = candidates.map((row) => row.contentHash as string);
  const existing = await db
    .collection("decks")
    .find(
      {
        gameId,
        meta: { $exists: true },
        $or: [
          ...(refs.length > 0 ? [{ "meta.sourceRef": { $in: refs } }] : []),
          { "meta.contentHash": { $in: hashes }, "meta.source": source, "meta.imported": true },
        ],
      },
      { projection: { _id: 1, name: 1, meta: 1 } }
    )
    .toArray();

  for (const row of candidates) {
    const match = existing.find(
      (doc) =>
        (row.sourceRef && doc.meta?.sourceRef === row.sourceRef) ||
        (doc.meta?.imported &&
          doc.meta?.contentHash === row.contentHash &&
          doc.meta?.source === source &&
          (doc.meta?.pilot ?? undefined) === row.pilot &&
          (doc.meta?.placement ?? undefined) === row.placement)
    );
    if (match) {
      row.status = "duplicate";
      row.duplicateOf = { deckId: match._id.toString(), name: match.name };
      row.notes = [`Déjà importé : « ${match.name} ».`];
    }
  }
}
