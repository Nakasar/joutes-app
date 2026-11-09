/**
 * Lecture d'un évènement du locator Riftbound (locator.riftbound.uvsgames.com).
 *
 * Le locator s'appuie sur une API publique, non documentée, qui se lit sans
 * compte : l'évènement, ses inscrits (place finale, bilan, deck) et chaque
 * deck. Ce module ne fait que traduire ses réponses ; les appels sont dans
 * `locator-api.ts`.
 *
 * Un deck public du locator ne contient que le deck principal (39 cartes),
 * les runes et la réserve : la légende, le champion choisi et les champs de
 * bataille sont réservés aux comptes connectés. La légende se lit dans le
 * classement des rondes (`deck_defining_card`), le champion se déduit
 * (`inferLegendAndChampion`) ; les champs de bataille manquent.
 */
import type { DeckCardInfo } from "@/lib/decks/contents";
import { isChampionCard } from "@/lib/decks/routing";
import { playableDomains } from "@/lib/decks/domains";
import type { ParsedDeckText } from "@/lib/decks/text";
import type { DeckZone, DeckZoneKey } from "@/lib/decks/zones";

/** Decks lus par appel au serveur : assez pour avancer vite, peu pour qu'un appel tienne largement dans le délai d'une action. */
export const LOCATOR_BATCH_SIZE = 10;

export const LOCATOR_EVENT_URL = "https://locator.riftbound.uvsgames.com/events/";

/** `locator.riftbound.uvsgames.com/events/1227032`, avec ou sans langue (`/fr/events/…`) ; ou le numéro seul. */
const EVENT_LINK = /^(?:https?:\/\/)?locator\.riftbound\.uvsgames\.com\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?events\/(\d+)(?:[/?#]|$)/i;

export function parseLocatorEventId(input: string): number | null {
  const value = input.trim();
  const id = /^\d+$/.test(value) ? value : value.match(EVENT_LINK)?.[1];
  if (!id) return null;
  const number = Number(id);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function locatorEventUrl(id: number): string {
  return `${LOCATOR_EVENT_URL}${id}`;
}

export type LocatorEvent = {
  id: number;
  url: string;
  name: string;
  /** Jour du tournoi, au fuseau de l'évènement : `2026-11-06`. */
  date: string;
  address?: string;
  playerCount: number;
  finished: boolean;
  decklistsPublished: boolean;
  format?: string;
  /** Les rondes dont le classement porte la légende de chaque joueur, de la dernière à la première phase. */
  standingRoundIds: number[];
  /** Toutes les rondes, dans l'ordre, avec leur phase : suisse, ou élimination directe (le top). */
  rounds: LocatorRound[];
};

export type LocatorRound = { id: number; number: number; phase: "swiss" | "top" };

type RawEvent = {
  id?: number;
  name?: string;
  start_datetime?: string;
  timezone?: string | null;
  full_address?: string | null;
  starting_player_count?: number | null;
  registered_user_count?: number | null;
  display_status?: string | null;
  gameplay_format?: { name?: string } | null;
  settings?: { decklist_status?: string | null } | null;
  tournament_phases?: {
    order_in_phases?: number | null;
    round_type?: string | null;
    rounds?: { id?: number | null; round_number?: number | null; standings_status?: string | null }[] | null;
  }[];
};

/** Les rondes de toutes les phases, de la première à la dernière ; une phase à élimination directe est le top. */
function allRounds(raw: RawEvent): LocatorRound[] {
  return [...(raw.tournament_phases ?? [])]
    .sort((a, b) => (a.order_in_phases ?? 0) - (b.order_in_phases ?? 0))
    .flatMap((phase) =>
      (phase.rounds ?? [])
        .filter((round): round is { id: number; round_number?: number | null } => typeof round.id === "number")
        .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0))
        .map((round) => ({ id: round.id, phase: /ELIMINATION/i.test(phase.round_type ?? "") ? "top" : "swiss" }) as const)
    )
    // Numérotées à la suite, phase après phase : le top peut repartir de 1 sur le locator.
    .map((round, index): LocatorRound => ({ ...round, number: index + 1 }));
}

/** La dernière ronde classée de chaque phase, de la dernière phase à la première. */
function standingRounds(raw: RawEvent): number[] {
  return [...(raw.tournament_phases ?? [])]
    .sort((a, b) => (b.order_in_phases ?? 0) - (a.order_in_phases ?? 0))
    .map((phase) => [...(phase.rounds ?? [])].reverse().find((round) => round.id && round.standings_status === "GENERATED")?.id)
    .filter((id): id is number => typeof id === "number");
}

/** Le jour d'un instant, au fuseau donné ; au fuseau UTC si celui-ci est inconnu. */
function dayIn(iso: string, timeZone?: string | null): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(
      instant
    );
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

export function toLocatorEvent(raw: RawEvent, id: number): LocatorEvent {
  const address = raw.full_address?.trim();
  const format = raw.gameplay_format?.name?.trim();
  return {
    id,
    url: locatorEventUrl(id),
    name: raw.name?.trim() || `Évènement ${id}`,
    date: raw.start_datetime ? dayIn(raw.start_datetime, raw.timezone) : "",
    ...(address ? { address } : {}),
    playerCount: raw.starting_player_count ?? raw.registered_user_count ?? 0,
    finished: raw.display_status === "complete",
    decklistsPublished: raw.settings?.decklist_status === "PUBLISHED",
    ...(format ? { format } : {}),
    standingRoundIds: standingRounds(raw),
    rounds: allRounds(raw),
  };
}

export type LocatorStanding = {
  /** L'inscription au locator : ce qui relie un joueur à ses matchs. */
  registrationId?: number;
  /** Place finale ; absente tant que le tournoi n'est pas classé. */
  place?: number;
  player: string;
  /** Victoires-défaites-nuls : `5-1-0`. */
  record: string;
  deckId?: string;
  /** La légende jouée, telle que le classement du locator la nomme (« Riven, The Exile »). */
  legend?: string;
};

export type RawRoundStanding = {
  user_event_status?: { id?: number | null; deck_defining_card?: { name?: string | null } | null } | null;
};

/** La légende de chaque inscription, lue dans le classement d'une ronde. */
export function legendsByRegistration(standings: RawRoundStanding[]): Map<number, string> {
  const legends = new Map<number, string>();
  for (const standing of standings) {
    const id = standing.user_event_status?.id;
    const name = standing.user_event_status?.deck_defining_card?.name?.trim();
    if (typeof id === "number" && name) legends.set(id, name);
  }
  return legends;
}

export type RawRegistration = {
  id?: number | null;
  best_identifier?: string | null;
  user?: { best_identifier?: string | null } | null;
  matches_won?: number | null;
  matches_lost?: number | null;
  matches_drawn?: number | null;
  final_place_in_standings?: number | null;
  deck_id?: string | null;
};

/** Les inscrits, du premier au dernier ; ceux sans place finale à la fin, par pseudo. */
export function toLocatorStandings(registrations: RawRegistration[], legends = new Map<number, string>()): LocatorStanding[] {
  return registrations
    .map((raw): LocatorStanding => {
      const place = raw.final_place_in_standings;
      const legend = typeof raw.id === "number" ? legends.get(raw.id) : undefined;
      const player = raw.best_identifier?.trim() || raw.user?.best_identifier?.trim() || "Joueur inconnu";
      return {
        ...(typeof place === "number" && place > 0 ? { place } : {}),
        player,
        record: [raw.matches_won, raw.matches_lost, raw.matches_drawn].map((value) => value ?? 0).join("-"),
        ...(raw.deck_id ? { deckId: raw.deck_id } : {}),
        ...(legend ? { legend } : {}),
        ...(typeof raw.id === "number" ? { registrationId: raw.id } : {}),
      };
    })
    .sort(
      (a, b) =>
        (a.place ?? Number.POSITIVE_INFINITY) - (b.place ?? Number.POSITIVE_INFINITY) || a.player.localeCompare(b.player, "fr")
    );
}

/** Les identifiants de deck du locator sont des UUID. */
export const LOCATOR_DECK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RawLocatorDeck = {
  name?: string | null;
  sections?: {
    section_type?: string | null;
    cards?: { quantity?: number | null; card?: { name?: string | null } | null }[] | null;
  }[];
};

/** La zone Joutes de chaque section du locator ; une section inconnue (« Neeko Board ») est ignorée. */
const SECTION_ZONES: Record<string, DeckZoneKey> = {
  main: "maindeck",
  rune_pool: "runes",
  sideboard: "sideboard",
  legend: "legend",
  champion: "champions",
  battlefield: "battlefields",
};

/** `legend` : la légende lue dans le classement, quand le deck n'en a pas. */
export function locatorDeckToParsed(deck: RawLocatorDeck, zones: DeckZone[], legend?: string): ParsedDeckText {
  const lines: ParsedDeckText["lines"] = [];
  const sections: DeckZoneKey[] = [];
  const ignored: string[] = [];

  for (const section of deck.sections ?? []) {
    const zone = SECTION_ZONES[section.section_type ?? ""];
    for (const entry of section.cards ?? []) {
      const name = entry.card?.name?.trim();
      const quantity = entry.quantity ?? 0;
      if (!name || quantity <= 0) continue;
      if (!zone || !zones.some((candidate) => candidate.key === zone)) {
        ignored.push(`${quantity} ${name}`);
        continue;
      }
      lines.push({ zone, name, quantity });
      if (!sections.includes(zone)) sections.push(zone);
    }
  }

  if (legend && !sections.includes("legend") && zones.some((zone) => zone.key === "legend")) {
    lines.unshift({ zone: "legend", name: legend, quantity: 1 });
    sections.unshift("legend");
  }

  return { lines, sections, ignored };
}

/** Le personnage d'une carte Riftbound : « Viktor » pour « Viktor, Herald of the Arcane ». */
export function championTag(name: string): string {
  return name.split(",")[0].trim().toLowerCase();
}

/** Exemplaires d'une même carte au plus, champion choisi compris. */
const MAX_COPIES = 3;

export type LegendInference = {
  legend?: DeckCardInfo;
  champion?: DeckCardInfo;
  /** Ce qui n'a pas pu se déduire, pour l'écran de vérification. */
  notes: string[];
};

/**
 * Retrouve la légende et le champion choisi d'un deck du locator.
 *
 * Le champion choisi sort du deck principal, mais ses autres exemplaires y
 * restent : la légende est celle du même personnage qu'une unité championne
 * du deck, dans les domaines de ses runes. Si deux personnages conviennent,
 * celui qui a le plus d'exemplaires l'emporte ; à égalité, rien n'est
 * choisi. Le champion est la seule version de ce personnage restée dans le
 * deck principal, s'il lui reste de la place (moins de trois exemplaires).
 *
 * Une liste qui a déjà sa légende ou son champion les garde.
 */
export function inferLegendAndChampion(
  parsed: ParsedDeckText,
  cardOf: (name: string) => DeckCardInfo | undefined,
  legends: DeckCardInfo[]
): LegendInference {
  const hasLegend = parsed.lines.some((line) => line.zone === "legend");
  const hasChampion = parsed.lines.some((line) => line.zone === "champions");
  if (hasLegend && hasChampion) return { notes: [] };

  const runeDomains = new Set(
    parsed.lines.filter((line) => line.zone === "runes").flatMap((line) => playableDomains(cardOf(line.name)?.domain))
  );

  // Les unités championnes du deck principal, par personnage.
  const copiesByCard = new Map<string, { card: DeckCardInfo; quantity: number }>();
  for (const line of parsed.lines) {
    if (line.zone !== "maindeck") continue;
    const card = cardOf(line.name);
    if (!card || !isChampionCard(card)) continue;
    const known = copiesByCard.get(card.id);
    copiesByCard.set(card.id, { card, quantity: (known?.quantity ?? 0) + line.quantity });
  }
  const copiesByTag = new Map<string, number>();
  for (const { card, quantity } of copiesByCard.values()) {
    const tag = championTag(card.name);
    copiesByTag.set(tag, (copiesByTag.get(tag) ?? 0) + quantity);
  }

  const notes: string[] = [];
  let legend: DeckCardInfo | undefined;
  let tag: string | undefined;

  const givenLegend = parsed.lines.find((line) => line.zone === "legend");
  if (givenLegend) {
    tag = championTag(givenLegend.name);
  } else {
    const fits = (candidate: DeckCardInfo) => {
      const domains = playableDomains(candidate.domain);
      return runeDomains.size === 0 || domains.every((domain) => runeDomains.has(domain));
    };
    const candidates = legends.filter((candidate) => copiesByTag.has(championTag(candidate.name)) && fits(candidate));
    const tags = [...new Set(candidates.map((candidate) => championTag(candidate.name)))].sort(
      (a, b) => (copiesByTag.get(b) ?? 0) - (copiesByTag.get(a) ?? 0)
    );

    if (tags.length === 0) {
      notes.push("Légende introuvable : le locator ne la publie pas, et aucun champion du deck ne la désigne.");
    } else if (tags.length > 1 && copiesByTag.get(tags[0]) === copiesByTag.get(tags[1])) {
      const names = [...new Set(candidates.map((candidate) => candidate.name))];
      notes.push(`Légende incertaine (${names.join(" ou ")}) : à choisir sur la fiche du deck.`);
    } else {
      tag = tags[0];
      const versions = [...new Map(candidates.filter((candidate) => championTag(candidate.name) === tag).map((c) => [c.name, c])).values()];
      if (versions.length === 1) {
        legend = versions[0];
      } else {
        notes.push(`Légende incertaine (${versions.map((candidate) => candidate.name).join(" ou ")}) : à choisir sur la fiche du deck.`);
      }
    }
  }

  // Le champion choisi n'est sûr que si une seule version du personnage reste
  // dans le deck principal : sans exemplaire, ou avec deux versions, il reste
  // vide plutôt que deviné (beaucoup de decks ne jouent que lui).
  let champion: DeckCardInfo | undefined;
  if (!hasChampion && tag) {
    const versions = [...copiesByCard.values()].filter(({ card }) => championTag(card.name) === tag);
    if (versions.length === 1 && copiesByCardRoom(versions[0].card, parsed, cardOf) > 0) {
      champion = versions[0].card;
    }
  }

  return { ...(legend ? { legend } : {}), ...(champion ? { champion } : {}), notes };
}

/** La place qu'il reste à une carte avant trois exemplaires, toutes zones de jeu confondues (hors réserve). */
function copiesByCardRoom(card: DeckCardInfo, parsed: ParsedDeckText, cardOf: (name: string) => DeckCardInfo | undefined): number {
  const played = parsed.lines
    .filter((line) => line.zone !== "sideboard" && cardOf(line.name)?.id === card.id)
    .reduce((total, line) => total + line.quantity, 0);
  return MAX_COPIES - played;
}

export type RawLocatorMatch = {
  status?: string | null;
  match_is_bye?: boolean | null;
  match_is_intentional_draw?: boolean | null;
  match_is_unintentional_draw?: boolean | null;
  winning_player?: number | null;
  games_won_by_winner?: number | null;
  games_won_by_loser?: number | null;
  games_drawn?: number | null;
  player_match_relationships?: {
    player_order?: number | null;
    player?: { id?: number | null } | null;
    user_event_status?: { id?: number | null; deck_defining_card?: { name?: string | null } | null } | null;
  }[];
};

/**
 * Un match, tel que la méta le garde : les inscriptions des deux joueurs
 * (`b` absent pour un bye), le gagnant (`null` pour un nul) et les manches
 * gagnées par chacun.
 */
export type ParsedLocatorMatch = {
  round: number;
  phase: "swiss" | "top";
  a: number;
  b?: number;
  winner: "a" | "b" | null;
  games: [number, number];
  /** La légende lue sur le match, pour les joueurs absents du classement. */
  legends: [string | undefined, string | undefined];
};

/** Les matchs terminés d'une ronde ; un match sans joueur lisible est ignoré. */
export function toLocatorMatches(raw: RawLocatorMatch[], round: LocatorRound): ParsedLocatorMatch[] {
  const matches: ParsedLocatorMatch[] = [];
  for (const match of raw) {
    if (match.status && match.status !== "COMPLETE") continue;
    const sides = [...(match.player_match_relationships ?? [])]
      .sort((x, y) => (x.player_order ?? 0) - (y.player_order ?? 0))
      .filter((side) => typeof side.user_event_status?.id === "number");
    if (sides.length === 0) continue;

    const [first, second] = sides;
    const a = first.user_event_status?.id as number;
    const b = second?.user_event_status?.id ?? undefined;
    const legends: [string | undefined, string | undefined] = [
      first.user_event_status?.deck_defining_card?.name?.trim() || undefined,
      second?.user_event_status?.deck_defining_card?.name?.trim() || undefined,
    ];

    if (b === undefined || match.match_is_bye) {
      matches.push({ round: round.number, phase: round.phase, a, winner: "a", games: [0, 0], legends });
      continue;
    }

    const draw = Boolean(match.match_is_intentional_draw || match.match_is_unintentional_draw) || !match.winning_player;
    const winnerSide = draw ? null : match.winning_player === first.player?.id ? "a" : match.winning_player === second?.player?.id ? "b" : null;
    const won = match.games_won_by_winner ?? 0;
    const lost = match.games_won_by_loser ?? 0;
    matches.push({
      round: round.number,
      phase: round.phase,
      a,
      b,
      winner: winnerSide,
      games: winnerSide === "b" ? [lost, won] : [won, lost],
      legends,
    });
  }
  return matches;
}
