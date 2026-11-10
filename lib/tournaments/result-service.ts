import "server-only";

import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { getDeckById } from "@/lib/db/decks";
import { getGameById } from "@/lib/db/games";
import { getMetaEventSummary, searchMetaEvents, type MetaEventSummary } from "@/lib/db/meta-events";
import { anyUserHasPermission } from "@/lib/db/permissions";
import {
  deleteTournamentResult,
  findUserResultForTournament,
  getTournamentResult,
  insertTournamentResult,
  isDuplicateKeyError,
  listClaimedSourceRefs,
  listResultsForDecks,
  listResultsByIds,
  listResultSummariesForUsers,
  listResultsForUsers,
  newTournamentResultId,
  updateTournamentResult,
} from "@/lib/db/tournament-results";
import { getUsersByIds } from "@/lib/db/users";
import { buildGroupTimeline, fillGroupTimeline, type GroupTournamentFilters } from "@/lib/play-groups/tournaments";
import { META_DECKS_PERMISSION } from "@/lib/meta/permissions";
import { escapeRegex } from "@/lib/utils/regex";
import type { Deck } from "@/lib/types/Deck";
import type { TournamentResult, TournamentResultVisibility } from "@/lib/types/TournamentResult";

import {
  canSeeResult,
  joutesSourceRef,
  locatorSourceRef,
  looksLikeUser,
  parseRecord,
  topCutSize,
  validateDeclaredResult,
  type DeclaredResultError,
} from "./results";

/**
 * Les résultats de tournoi côté serveur : déclarer, se reconnaître dans un
 * tournoi du locator, lier son deck, choisir qui voit, supprimer. La route
 * `/api/tournament-results` et les actions de la vue Tournois du groupe
 * passent par ici, pour ne tenir les règles qu'à un endroit.
 */

export type ResultServiceError =
  | "UNAUTHENTICATED"
  | "INVALID"
  | "NOT_FOUND"
  | "FORBIDDEN"
  /** Ce tournoi est déjà dans mes résultats. */
  | "DUPLICATE"
  /** Ce joueur du locator est déjà reconnu par un autre compte. */
  | "CLAIMED"
  /** Le deck n'est pas à moi, ou pas du jeu du tournoi. */
  | "DECK"
  | DeclaredResultError;

type Failure = { ok: false; error: ResultServiceError };
type Success<T> = { ok: true } & T;

export function resultErrorStatus(error: ResultServiceError): number {
  switch (error) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "DUPLICATE":
    case "CLAIMED":
      return 409;
    default:
      return 400;
  }
}

function isVisibility(value: unknown): value is TournamentResultVisibility {
  return value === "groups" || value === "public";
}

/** Le deck que je lie à un résultat : le mien, du même jeu, pas un deck méta importé. */
async function readLinkableDeck(deckId: string, userId: string, gameId: string | undefined): Promise<Deck | null> {
  const deck = await getDeckById(deckId);
  if (!deck || deck.playerId !== userId || deck.meta?.imported) return null;
  if (gameId && deck.gameId !== gameId) return null;

  return deck;
}

function deckFields(deck: Deck): Pick<TournamentResult, "deckId" | "deckVersion" | "legendCardId" | "legendName" | "domains"> {
  return {
    deckId: deck.id,
    deckVersion: deck.version ?? 1,
    ...(deck.legendCardId ? { legendCardId: deck.legendCardId } : {}),
    ...(deck.legendName ? { legendName: deck.legendName } : {}),
    domains: deck.domains ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tournois Joutes, lus pour la recherche et les inscriptions à venir
// ---------------------------------------------------------------------------

type TournamentRow = {
  _id: ObjectId;
  name: string;
  gameId?: string;
  status: string;
  location?: string;
  startsAt?: Date;
  createdAt?: Date;
};

const tournaments = () => db.collection<TournamentRow>("tournaments");

/**
 * Les tournois Joutes que je peux lire, comme `assertCanReadTournament` :
 * ceux où je suis inscrit, et ceux que j'organise ou arbitre. Les autres
 * restent invisibles à la recherche et à la déclaration.
 */
async function readableTournamentsFilter(userId: string): Promise<Record<string, unknown>> {
  const registrations = await db
    .collection<{ tournamentId: ObjectId; userId?: string }>("tournament-players")
    .find({ userId }, { projection: { tournamentId: 1 } })
    .sort({ _id: -1 })
    .limit(1000)
    .toArray();

  return {
    $or: [
      { _id: { $in: registrations.map((row) => row.tournamentId) } },
      { createdBy: userId },
      { organizerIds: userId },
      { judgeIds: userId },
    ],
  };
}

export type JoutesTournamentSuggestion = {
  id: string;
  name: string;
  date: string;
  gameId?: string;
  place?: string;
  /** J'y ai déjà un résultat. */
  mine: boolean;
};

export type LocatorPlayerSuggestion = {
  registrationId: number;
  name: string;
  place?: number;
  record?: string;
  legend?: string;
  /** `me` : déjà reconnu par moi ; `other` : par un autre compte. */
  claimedBy?: "me" | "other";
};

export type LocatorEventSuggestion = {
  id: string;
  eventRef: string;
  name: string;
  date: string;
  gameId: string;
  playerCount: number;
  /** Les joueurs dont le nom ressemble au mien. */
  suggestions: LocatorPlayerSuggestion[];
};

async function claimedBy(event: MetaEventSummary, players: MetaEventSummary["players"], userId: string) {
  const locatorId = event.eventRef.replace(/^locator:/, "");
  const claims = await listClaimedSourceRefs(players.map((player) => locatorSourceRef(locatorId, player.id)));

  return (player: MetaEventSummary["players"][number]): LocatorPlayerSuggestion => {
    const owner = claims.get(locatorSourceRef(locatorId, player.id));
    return {
      registrationId: player.id,
      name: player.name,
      ...(player.place ? { place: player.place } : {}),
      ...(player.record ? { record: player.record } : {}),
      ...(player.legend ? { legend: player.legend } : {}),
      ...(owner ? { claimedBy: owner === userId ? ("me" as const) : ("other" as const) } : {}),
    };
  };
}

async function readUserNames(userId: string): Promise<string[]> {
  const [user] = await getUsersByIds([userId]);
  return [user?.displayName, user?.username].filter((name): name is string => Boolean(name));
}

/**
 * La recherche de la fenêtre « Déclarer un résultat » : les tournois Joutes
 * terminés et les tournois importés du locator dont le nom contient la
 * recherche. Pour un tournoi du locator, les joueurs qui me ressemblent.
 */
export async function searchResultTournaments(
  userId: string | null,
  query: string,
  gameId?: string,
): Promise<Success<{ joutes: JoutesTournamentSuggestion[]; locator: LocatorEventSuggestion[] }> | Failure> {
  if (!userId) return { ok: false, error: "UNAUTHENTICATED" };
  const text = query.replace(/\s+/g, " ").trim().slice(0, 80);
  if (text.length < 2) return { ok: true, joutes: [], locator: [] };

  const filter: Record<string, unknown> = {
    ...(await readableTournamentsFilter(userId)),
    status: "completed",
    name: { $regex: escapeRegex(text), $options: "i" },
    gameId: gameId ? gameId : { $exists: true, $nin: [null, ""] },
  };
  const [rows, events, names] = await Promise.all([
    tournaments()
      .find(filter, { projection: { name: 1, gameId: 1, location: 1, startsAt: 1, createdAt: 1 } })
      .sort({ startsAt: -1, createdAt: -1 })
      .limit(6)
      .toArray(),
    searchMetaEvents(text, gameId),
    readUserNames(userId),
  ]);

  const mine = await Promise.all(
    rows.map((row) => findUserResultForTournament(userId, joutesSourceRef(row._id.toString()))),
  );
  const joutes = rows.map((row, index) => ({
    id: row._id.toString(),
    name: row.name,
    date: (row.startsAt ?? row.createdAt ?? new Date()).toISOString(),
    ...(row.gameId ? { gameId: row.gameId } : {}),
    ...(row.location ? { place: row.location } : {}),
    mine: Boolean(mine[index]),
  }));

  const locator = await Promise.all(
    events.map(async (event) => {
      const alike = event.players.filter((player) => looksLikeUser(player.name, names)).slice(0, 5);
      const describe = await claimedBy(event, alike, userId);

      return {
        id: event.id,
        eventRef: event.eventRef,
        name: event.source,
        date: event.eventDate,
        gameId: event.gameId,
        playerCount: event.players.length,
        suggestions: alike.map(describe),
      };
    }),
  );

  return { ok: true, joutes, locator };
}

/** Les joueurs d'un tournoi du locator dont le nom contient la recherche : « je n'apparais pas sous mon nom ». */
export async function searchLocatorPlayers(
  userId: string | null,
  eventId: string,
  query: string,
): Promise<Success<{ players: LocatorPlayerSuggestion[] }> | Failure> {
  if (!userId) return { ok: false, error: "UNAUTHENTICATED" };
  const event = await getMetaEventSummary(eventId);
  if (!event) return { ok: false, error: "NOT_FOUND" };

  const text = query.trim().toLowerCase();
  const found = event.players
    .filter((player) => !text || player.name.toLowerCase().includes(text))
    .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity))
    .slice(0, 30);
  const describe = await claimedBy(event, found, userId);

  return { ok: true, players: found.map(describe) };
}

// ---------------------------------------------------------------------------
// Écrire
// ---------------------------------------------------------------------------

/**
 * Déclarer un résultat. Avec `joutesTournamentId`, le tournoi Joutes donne son
 * nom, sa date et son lieu ; seulement un tournoi que je peux lire (inscrit ou staff).
 * Avec un deck, la version jouée, la légende et les domaines viennent du deck.
 */
export async function declareResult(
  userId: string | null,
  input: Record<string, unknown>,
): Promise<Success<{ result: TournamentResult }> | Failure> {
  if (!userId) return { ok: false, error: "UNAUTHENTICATED" };

  let values: Record<string, unknown> = input;
  let tournamentRef: string | undefined;
  if (typeof input.joutesTournamentId === "string" && input.joutesTournamentId) {
    if (!ObjectId.isValid(input.joutesTournamentId)) return { ok: false, error: "NOT_FOUND" };
    const row = await tournaments().findOne({
      ...(await readableTournamentsFilter(userId)),
      _id: new ObjectId(input.joutesTournamentId),
      status: "completed",
    });
    if (!row?.gameId) return { ok: false, error: "NOT_FOUND" };
    tournamentRef = joutesSourceRef(row._id.toString());
    values = {
      ...input,
      name: row.name,
      date: (row.startsAt ?? row.createdAt ?? new Date()).toISOString(),
      gameId: row.gameId,
      place: row.location,
    };
  }

  const validated = validateDeclaredResult(values);
  if (!validated.ok) return validated;
  const value = validated.value;

  const game = value.gameId ? await getGameById(value.gameId) : null;
  if (!game) return { ok: false, error: "GAME" };

  if (tournamentRef && (await findUserResultForTournament(userId, tournamentRef))) {
    return { ok: false, error: "DUPLICATE" };
  }

  let fromDeck: ReturnType<typeof deckFields> | null = null;
  if (value.deckId) {
    const deck = await readLinkableDeck(value.deckId, userId, game.id);
    if (!deck) return { ok: false, error: "DECK" };
    fromDeck = deckFields(deck);
  }

  const id = newTournamentResultId();
  const result = await insertTournamentResult({
    id,
    userId,
    gameId: game.id,
    source: "declared",
    sourceRef: `declared:${id}`,
    ...(tournamentRef ? { tournamentRef } : {}),
    name: value.name,
    date: value.date,
    ...(value.place ? { place: value.place } : {}),
    ...(value.playerCount ? { playerCount: value.playerCount } : {}),
    ...(value.placement ? { placement: value.placement } : {}),
    ...(value.topCut ? { topCut: value.topCut } : {}),
    ...(value.record ? { record: value.record } : {}),
    ...(value.legendName && !fromDeck?.legendName ? { legendName: value.legendName } : {}),
    domains: [],
    ...(fromDeck ?? {}),
    ...(fromDeck?.legendName ? { legendFromDeck: true } : {}),
    visibility: value.visibility,
  });

  return { ok: true, result };
}

/**
 * « C'est moi » : je me reconnais dans un joueur d'un tournoi du locator. Sa
 * place, son bilan, sa légende et ses domaines deviennent mon résultat. Une
 * inscription ne se reconnaît qu'une fois (index unique) ; un administrateur
 * de la méta peut défaire une erreur.
 */
export async function claimLocatorResult(
  userId: string | null,
  input: { eventId?: unknown; registrationId?: unknown; deckId?: unknown; visibility?: unknown },
): Promise<Success<{ result: TournamentResult }> | Failure> {
  if (!userId) return { ok: false, error: "UNAUTHENTICATED" };
  if (typeof input.eventId !== "string" || !Number.isInteger(input.registrationId)) {
    return { ok: false, error: "INVALID" };
  }
  const visibility = input.visibility ?? "groups";
  if (!isVisibility(visibility)) return { ok: false, error: "VISIBILITY" };

  const event = await getMetaEventSummary(input.eventId);
  const player = event?.players.find((candidate) => candidate.id === input.registrationId);
  if (!event || !player) return { ok: false, error: "NOT_FOUND" };

  if (await findUserResultForTournament(userId, event.eventRef)) {
    return { ok: false, error: "DUPLICATE" };
  }

  let fromDeck: ReturnType<typeof deckFields> | null = null;
  if (typeof input.deckId === "string" && input.deckId) {
    const deck = await readLinkableDeck(input.deckId, userId, event.gameId);
    if (!deck) return { ok: false, error: "DECK" };
    fromDeck = deckFields(deck);
  }

  const record = parseRecord(player.record);
  const inTop = event.topPlayerIds.includes(player.id);
  const topCut = inTop ? topCutSize(event.topPlayerIds.length) : undefined;

  try {
    const result = await insertTournamentResult({
      userId,
      gameId: event.gameId,
      source: "locator",
      sourceRef: locatorSourceRef(event.eventRef.replace(/^locator:/, ""), player.id),
      tournamentRef: event.eventRef,
      name: event.source,
      date: event.eventDate,
      playerCount: event.players.length,
      ...(player.place ? { placement: player.place } : {}),
      ...(topCut ? { topCut } : {}),
      ...(record ? { record } : {}),
      ...(player.legend ? { legendName: player.legend } : {}),
      ...(player.legendCardId ? { legendCardId: player.legendCardId } : {}),
      domains: player.domains ?? [],
      // Le deck lié garde sa version ; la légende reste celle que le locator a vue jouer.
      ...(fromDeck ? { deckId: fromDeck.deckId, deckVersion: fromDeck.deckVersion } : {}),
      visibility,
    });

    return { ok: true, result };
  } catch (error) {
    if (isDuplicateKeyError(error)) return { ok: false, error: "CLAIMED" };
    throw error;
  }
}

/** Lier un de mes decks (ou délier avec `null`), ou changer qui voit le résultat. */
export async function updateMyResult(
  userId: string | null,
  resultId: string,
  input: { deckId?: unknown; visibility?: unknown },
): Promise<Success<{ result: TournamentResult }> | Failure> {
  if (!userId) return { ok: false, error: "UNAUTHENTICATED" };
  const result = await getTournamentResult(resultId);
  if (!result) return { ok: false, error: "NOT_FOUND" };
  if (result.userId !== userId) return { ok: false, error: "FORBIDDEN" };

  const set: Partial<TournamentResult> = {};
  const unset: (keyof TournamentResult)[] = [];

  if (input.visibility !== undefined) {
    if (!isVisibility(input.visibility)) return { ok: false, error: "VISIBILITY" };
    set.visibility = input.visibility;
  }

  // La légende suit le deck quand elle en vient, ou quand le résultat n'en a pas.
  // Celle du locator, de Joutes ou saisie à la main reste.
  const legendFollowsDeck = !result.legendName || Boolean(result.legendFromDeck);
  if (input.deckId === null) {
    unset.push("deckId", "deckVersion");
    if (result.legendFromDeck) {
      unset.push("legendName", "legendCardId", "legendFromDeck");
      set.domains = [];
    }
  } else if (typeof input.deckId === "string") {
    const deck = await readLinkableDeck(input.deckId, userId, result.gameId);
    if (!deck) return { ok: false, error: "DECK" };
    const fields = deckFields(deck);
    set.deckId = fields.deckId;
    set.deckVersion = fields.deckVersion;
    if (legendFollowsDeck && fields.legendName) {
      set.legendName = fields.legendName;
      set.legendFromDeck = true;
      set.domains = fields.domains;
      if (fields.legendCardId) set.legendCardId = fields.legendCardId;
      else unset.push("legendCardId");
    } else if (result.legendFromDeck) {
      // Le nouveau deck n'a pas de légende : celle de l'ancien ne vaut plus.
      unset.push("legendName", "legendCardId", "legendFromDeck");
      set.domains = [];
    }
  } else if (input.deckId !== undefined) {
    return { ok: false, error: "INVALID" };
  }

  if (Object.keys(set).length === 0 && unset.length === 0) return { ok: false, error: "INVALID" };
  await updateTournamentResult(resultId, set, unset);

  return { ok: true, result: { ...result, ...set, ...Object.fromEntries(unset.map((key) => [key, undefined])) } };
}

/**
 * Supprimer un résultat : le mien s'il est déclaré ou reconnu (un résultat
 * Joutes revient à chaque réécriture du tournoi, il se masque en le gardant
 * pour mes groupes). Un administrateur de la méta défait un « C'est moi ».
 */
export async function deleteResult(userId: string | null, resultId: string): Promise<Success<object> | Failure> {
  if (!userId) return { ok: false, error: "UNAUTHENTICATED" };
  const result = await getTournamentResult(resultId);
  if (!result) return { ok: false, error: "NOT_FOUND" };

  const mine = result.userId === userId;
  if (result.source === "joutes") return { ok: false, error: "FORBIDDEN" };
  if (!mine && !(result.source === "locator" && (await anyUserHasPermission([userId], META_DECKS_PERMISSION)))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  await deleteTournamentResult(resultId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lire
// ---------------------------------------------------------------------------

/** Mes résultats, toutes sources : l'écran de profil et l'application mobile. */
export async function listMyResults(userId: string | null): Promise<Success<{ results: TournamentResult[] }> | Failure> {
  if (!userId) return { ok: false, error: "UNAUTHENTICATED" };
  return { ok: true, results: await listResultsForUsers([userId], 500) };
}

/**
 * La vue Tournois d'un groupe : les résumés de tous les résultats des membres
 * (totaux, palmarès, filtres) et la page de la timeline en résultats complets.
 */
export async function readGroupTournaments(memberIds: string[], filters: GroupTournamentFilters) {
  const summaries = await listResultSummariesForUsers(memberIds);
  const page = buildGroupTimeline(summaries, filters);
  const shownIds = page.months.flatMap((month) =>
    month.tournaments.flatMap((tournament) => tournament.results.map((result) => result.id)),
  );
  const full = new Map((await listResultsByIds(shownIds)).map((result) => [result.id, result]));

  return { summaries, timeline: fillGroupTimeline(page, full) };
}

/** Deux comptes ont-ils un groupe de jeu en commun ? */
export async function sharePlayGroup(userId: string, otherId: string): Promise<boolean> {
  if (userId === otherId) return true;
  const group = await db
    .collection("playGroups")
    .findOne({ "members.userId": { $all: [userId, otherId] } }, { projection: { _id: 1 } });

  return Boolean(group);
}

/**
 * Les résultats d'un deck que le lecteur peut voir : l'encart « Résultats en
 * tournoi » de sa fiche. Tous appartiennent à l'auteur du deck (seul l'auteur
 * lie son deck), un seul test de groupe commun suffit.
 */
export async function listVisibleDeckResults(deck: Pick<Deck, "id" | "playerId">, viewerId: string | null) {
  const results = (await listResultsForDecks([deck.id])).filter((result) => result.userId === deck.playerId);
  if (results.length === 0) return [];
  const shares = viewerId ? await sharePlayGroup(viewerId, deck.playerId) : false;

  return results.filter((result) => canSeeResult(result, viewerId, shares));
}

export type UpcomingRegistration = {
  tournamentId: string;
  name: string;
  date: string;
  gameId?: string;
  place?: string;
  userIds: string[];
};

/** Les tournois Joutes à venir où des membres sont inscrits : l'encart « Prochains tournois ». */
export async function listUpcomingRegistrations(memberIds: string[], now = new Date()): Promise<UpcomingRegistration[]> {
  if (memberIds.length === 0) return [];
  const registrations = await db
    .collection<{ tournamentId: ObjectId; userId?: string; status: string }>("tournament-players")
    .find({ userId: { $in: memberIds }, status: { $ne: "dropped" } }, { projection: { tournamentId: 1, userId: 1 } })
    .sort({ _id: -1 })
    .limit(2000)
    .toArray();
  if (registrations.length === 0) return [];

  const since = new Date(now.getTime() - 86_400_000);
  const rows = await tournaments()
    .find(
      {
        _id: { $in: [...new Set(registrations.map((row) => row.tournamentId.toString()))].map((id) => new ObjectId(id)) },
        status: { $ne: "completed" },
        startsAt: { $gte: since },
      },
      { projection: { name: 1, gameId: 1, location: 1, startsAt: 1 } },
    )
    .sort({ startsAt: 1 })
    .limit(6)
    .toArray();

  return rows.map((row) => ({
    tournamentId: row._id.toString(),
    name: row.name,
    date: (row.startsAt as Date).toISOString(),
    ...(row.gameId ? { gameId: row.gameId } : {}),
    ...(row.location ? { place: row.location } : {}),
    userIds: [
      ...new Set(
        registrations
          .filter((registration) => registration.tournamentId.equals(row._id) && registration.userId)
          .map((registration) => registration.userId as string),
      ),
    ],
  }));
}
