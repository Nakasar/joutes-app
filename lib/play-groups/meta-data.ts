import "server-only";

import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { TOURNAMENT_RESULTS_COLLECTION } from "@/lib/db/tournament-results";
import { playableDomains } from "@/lib/decks/domains";
import type { DeckCards } from "@/lib/decks/contents";
import { readAllGames } from "@/lib/db/games-cached";
import { listPlayGroupDecks } from "@/lib/db/play-group-decks";
import { countedCards, knownGameSets, loadMetaSample } from "@/lib/meta/load";
import { currentSetPeriod, setPeriods, type SetPeriod } from "@/lib/meta/set-periods";
import { resolveMetaSettings } from "@/lib/meta/settings";
import { computeCardStats, computeOverview, type MetaCardStat } from "@/lib/meta/stats";
import type { MetaEventMatch, MetaEventPlayer } from "@/lib/meta/match-stats";
import type { MetaCard, MetaSampleDeck } from "@/lib/meta/stats";
import type { Game } from "@/lib/types/Game";
import type { TournamentResult } from "@/lib/types/TournamentResult";

import {
  ALL_PERIODS,
  between,
  computeGroupMeta,
  groupMatchups,
  harmonizeSides,
  joutesSides,
  locatorSides,
  metaReference,
  resultsBetween,
  toSampleDeck,
  type GroupMatchSide,
  type GroupMatchups,
  type GroupMeta,
  type GroupMetaParams,
  type GroupMetaResult,
  type JoutesMatch,
} from "./meta";

/**
 * Ce que la méta d'un groupe lit en base, pour un jeu : les résultats des
 * membres, les cartes des decks liés, et les matchs connus de leurs
 * tournois. Les calculs sont dans `./meta.ts`.
 */

const results = () => db.collection<TournamentResult>(TOURNAMENT_RESULTS_COLLECTION);

/** Les jeux où des membres ont des résultats, avec leur nombre. */
export async function countGroupResultsByGame(memberIds: string[]): Promise<{ gameId: string; count: number }[]> {
  if (memberIds.length === 0) return [];
  const rows = await results()
    .aggregate<{ _id: string; count: number }>([
      { $match: { userId: { $in: memberIds }, provisional: { $ne: true }, gameId: { $exists: true, $ne: null } } },
      { $group: { _id: "$gameId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  return rows.map((row) => ({ gameId: row._id, count: row.count }));
}

export type GroupMetaData = {
  results: GroupMetaResult[];
  /** Les cartes comptées de chaque deck lié, à sa version actuelle. */
  deckCards: Map<string, MetaSampleDeck["cards"]>;
  /** La fiche des cartes jouées et des légendes : nom, image, domaines. */
  cards: Record<string, MetaCard>;
  /** Chaque match connu d'un membre, avec la date de son tournoi pour la période. */
  sides: (GroupMatchSide & { date: string })[];
};

type DeckDoc = { _id: ObjectId; playerId: string; gameId: string; visibility?: string; cards?: DeckCards };
type MetaEventDoc = { gameId: string; eventRef: string; eventDate: Date; players: MetaEventPlayer[]; matches: MetaEventMatch[] };
type PlayerDoc = { _id: ObjectId; tournamentId: ObjectId; userId?: string };
type MatchDoc = JoutesMatch & { tournamentId: ObjectId };

export async function loadGroupMetaData(memberIds: string[], gameId: string, playGroupId: string): Promise<GroupMetaData> {
  if (memberIds.length === 0) return { results: [], deckCards: new Map(), cards: {}, sides: [] };

  const rows = await results()
    .find(
      { userId: { $in: memberIds }, gameId, provisional: { $ne: true } },
      {
        projection: {
          _id: 0,
          id: 1,
          userId: 1,
          gameId: 1,
          source: 1,
          sourceRef: 1,
          tournamentRef: 1,
          name: 1,
          date: 1,
          placement: 1,
          record: 1,
          deckId: 1,
          legendCardId: 1,
          legendName: 1,
          domains: 1,
        },
      },
    )
    .sort({ date: -1 })
    .toArray();
  const groupResults = rows.map((row) => ({ ...row, domains: row.domains ?? [] })) as (GroupMetaResult &
    Pick<TournamentResult, "sourceRef">)[];

  // Les decks liés : seuls ceux de l'auteur du résultat comptent (c'est toujours lui qui lie).
  // Un deck privé ne compte que s'il est partagé dans le groupe : sinon ses
  // cartes se liraient dans l'onglet Cartes (filtré sur ce seul membre).
  const owners = new Map(groupResults.flatMap((result) => (result.deckId ? [[result.deckId, result.userId] as const] : [])));
  const deckIds = [...owners.keys()].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const [decks, groupDecks] =
    deckIds.length > 0
      ? await Promise.all([
          db
            .collection<DeckDoc>("decks")
            .find({ _id: { $in: deckIds } }, { projection: { playerId: 1, gameId: 1, visibility: 1, cards: 1 } })
            .toArray(),
          listPlayGroupDecks(playGroupId),
        ])
      : [[], []];
  const inGroup = new Set(groupDecks.map((link) => link.deckId));
  const deckCards = new Map(
    decks
      .filter((deck) => owners.get(deck._id.toString()) === deck.playerId && deck.gameId === gameId)
      .filter((deck) => deck.visibility !== "private" || inGroup.has(deck._id.toString()))
      .map((deck) => [deck._id.toString(), countedCards(deck.cards)]),
  );

  const [locator, joutes] = await Promise.all([loadLocatorSides(groupResults, gameId), loadJoutesSides(groupResults, memberIds)]);
  const sides = [...locator, ...joutes];

  const cardIds = [
    ...new Set([
      ...[...deckCards.values()].flatMap((cards) => cards.map((entry) => entry.cardId)),
      ...groupResults.flatMap((result) => (result.legendCardId ? [result.legendCardId] : [])),
      ...sides.flatMap((side) => (side.opponentLegendCardId ? [side.opponentLegendCardId] : [])),
    ]),
  ];
  const infos = await getDeckCardInfos(gameId, cardIds);
  const cards: Record<string, MetaCard> = Object.fromEntries(
    infos.map((info) => [
      info.id,
      {
        id: info.id,
        name: info.name,
        ...(info.image ? { image: info.image } : {}),
        ...(info.type ? { type: info.type } : {}),
        ...(info.setCode ? { setCode: info.setCode } : {}),
        domains: playableDomains(info.domain),
      },
    ]),
  );

  return { results: groupResults, deckCards, cards, sides };
}

/** Les tournois du locator où un membre s'est reconnu : leurs matchs, vus de ses inscriptions. */
async function loadLocatorSides(
  rows: Pick<TournamentResult, "source" | "sourceRef" | "tournamentRef" | "userId">[],
  gameId: string,
) {
  const claims = new Map<string, Map<number, string>>();
  for (const row of rows) {
    if (row.source !== "locator" || !row.tournamentRef) continue;
    const registration = Number(row.sourceRef.split("#")[1]);
    if (!Number.isInteger(registration)) continue;
    const members = claims.get(row.tournamentRef) ?? new Map<number, string>();
    members.set(registration, row.userId);
    claims.set(row.tournamentRef, members);
  }
  if (claims.size === 0) return [];

  const events = await db
    .collection<MetaEventDoc>("metaEvents")
    .find({ gameId, eventRef: { $in: [...claims.keys()] } }, { projection: { eventRef: 1, eventDate: 1, players: 1, matches: 1 } })
    .toArray();

  return events.flatMap((event) => {
    const date = new Date(event.eventDate).toISOString();
    return locatorSides(
      { id: event.eventRef, source: event.eventRef, eventDate: date, players: event.players, matches: event.matches },
      claims.get(event.eventRef) ?? new Map(),
    ).map((side) => ({ ...side, date }));
  });
}

/**
 * Les tournois Joutes des membres : leurs matchs terminés. La légende d'un
 * joueur vient de son résultat, quand il en a un qu'on peut lire : celui
 * d'un membre, ou un résultat public.
 */
async function loadJoutesSides(rows: Pick<TournamentResult, "source" | "tournamentRef" | "date">[], memberIds: string[]) {
  const refs = [...new Set(rows.filter((row) => row.source === "joutes" && row.tournamentRef).map((row) => row.tournamentRef as string))];
  const ids = refs.map((ref) => ref.slice("joutes:".length)).filter((id) => ObjectId.isValid(id));
  if (ids.length === 0) return [];
  const tournamentIds = ids.map((id) => new ObjectId(id));
  const members = new Set(memberIds);
  const dateOf = new Map(rows.map((row) => [row.tournamentRef, row.date]));

  const [players, matches, legends] = await Promise.all([
    db
      .collection<PlayerDoc>("tournament-players")
      .find({ tournamentId: { $in: tournamentIds }, userId: { $exists: true } }, { projection: { tournamentId: 1, userId: 1 } })
      .toArray(),
    db
      .collection<MatchDoc>("tournament-matches")
      .find(
        { tournamentId: { $in: tournamentIds }, status: "completed" },
        { projection: { tournamentId: 1, players: 1, winnerIds: 1, status: 1, resolution: 1 } },
      )
      .toArray(),
    results()
      .find(
        { tournamentRef: { $in: refs }, legendName: { $exists: true }, provisional: { $ne: true } },
        { projection: { _id: 0, userId: 1, tournamentRef: 1, legendName: 1, legendCardId: 1, visibility: 1 } },
      )
      .toArray(),
  ]);

  const sides: (GroupMatchSide & { date: string })[] = [];
  for (const tournamentId of tournamentIds) {
    const ref = `joutes:${tournamentId.toString()}`;
    const here = players.filter((player) => player.tournamentId.equals(tournamentId));
    const userOf = new Map(here.map((player) => [player._id.toString(), player.userId as string]));
    const legendByUser = new Map(
      legends
        .filter((legend) => legend.tournamentRef === ref && (members.has(legend.userId) || legend.visibility === "public"))
        .map((legend) => [
          legend.userId,
          { name: legend.legendName as string, ...(legend.legendCardId ? { cardId: legend.legendCardId } : {}) },
        ]),
    );
    const legendOf = new Map(
      here.flatMap((player) => {
        const legend = legendByUser.get(player.userId as string);
        return legend ? [[player._id.toString(), legend] as const] : [];
      }),
    );
    const date = dateOf.get(ref) ?? new Date().toISOString();
    sides.push(
      ...joutesSides(
        matches.filter((match) => match.tournamentId.equals(tournamentId)),
        userOf,
        legendOf,
        members,
      ).map((side) => ({ ...side, date })),
    );
  }

  return sides;
}

export type GroupMetaPage = {
  /** Les jeux où des membres ont des résultats, du plus joué au moins joué. */
  games: { game: Pick<Game, "id" | "name" | "slug" | "icon">; count: number; hasMeta: boolean }[];
  game?: Pick<Game, "id" | "name" | "slug" | "icon">;
  /** La méta du jeu existe : on peut comparer. */
  hasMeta: boolean;
  periods: SetPeriod[];
  /** La période affichée ; absente : toute l'histoire. */
  period?: SetPeriod;
  /** Les membres qui ont au moins un résultat sur ce jeu, pour le filtre. */
  memberIds: string[];
  meta: GroupMeta;
  matchups: GroupMatchups;
  cardStats: MetaCardStat[];
  /** Participations dont le deck lié donne les cartes. */
  withCards: number;
  cards: Record<string, MetaCard>;
  /** Le jeu n'a pas de méta : rien à comparer. Ou la comparaison est éteinte. */
  compared: boolean;
};

/**
 * La méta d'un groupe pour la page et l'API : le jeu choisi (celui où les
 * membres ont le plus de résultats par défaut), la période (l'extension en
 * cours par défaut, quand le jeu en date), le membre, et le repère de la
 * méta du jeu sur la même période.
 */
export async function readGroupMeta(
  playGroupId: string,
  memberIds: string[],
  params: GroupMetaParams,
  now = new Date(),
): Promise<GroupMetaPage> {
  const [counts, allGames] = await Promise.all([countGroupResultsByGame(memberIds), readAllGames()]);
  const gameById = new Map(allGames.map((game) => [game.id, game]));
  const games = counts.flatMap(({ gameId, count }) => {
    const game = gameById.get(gameId);
    return game
      ? [{ game: { id: game.id, name: game.name, slug: game.slug, icon: game.icon }, count, hasMeta: Boolean(game.features?.meta) }]
      : [];
  });
  const chosen = gameById.get(games.find((entry) => entry.game.id === params.gameId)?.game.id ?? games[0]?.game.id ?? "");

  const empty: GroupMetaPage = {
    games,
    hasMeta: false,
    periods: [],
    memberIds: [],
    meta: computeGroupMeta([], {}),
    matchups: groupMatchups([]),
    cardStats: [],
    withCards: 0,
    cards: {},
    compared: false,
  };
  if (!chosen) return empty;

  const hasMeta = Boolean(chosen.features?.meta);
  // L'échantillon de la méta du jeu ne dépend que du jeu : il se lit en même temps.
  const [data, sample] = await Promise.all([
    loadGroupMetaData(memberIds, chosen.id, playGroupId),
    hasMeta && params.compare ? loadMetaSample(chosen.id, chosen.slug) : undefined,
  ]);
  const settings = resolveMetaSettings(chosen.metaSettings);
  const setNames = Object.fromEntries(knownGameSets(chosen.slug).map((set) => [set.setCode, set.name]));
  const periods = setPeriods(settings.setReleases, setNames);
  const today = now.toISOString().slice(0, 10);
  const period =
    params.ext === ALL_PERIODS ? undefined : (periods.find((candidate) => candidate.setCode === params.ext) ?? currentSetPeriod(periods, today));

  const inPeriod = resultsBetween(data.results, period?.from, period?.to);
  const shown = params.userId ? inPeriod.filter((result) => result.userId === params.userId) : inPeriod;

  const reference = sample
    ? metaReference(computeOverview(between(sample.decks, (deck) => deck.eventDate, period?.from, period?.to), sample.cards, []))
    : undefined;

  // Les légendes connues donnent leur carte (et leur image) aux légendes des
  // matchs lues par leur seul nom.
  const knownLegends = [
    ...data.results.flatMap((result) => (result.legendCardId && result.legendName ? [{ cardId: result.legendCardId, name: result.legendName }] : [])),
    ...(sample?.decks ?? []).flatMap((deck) => (deck.legendCardId && deck.legendName ? [{ cardId: deck.legendCardId, name: deck.legendName }] : [])),
  ];
  const sides = harmonizeSides(data.sides, knownLegends);
  const cards = { ...data.cards };
  for (const side of sides) {
    for (const cardId of [side.legendCardId, side.opponentLegendCardId]) {
      if (cardId && !cards[cardId] && sample?.cards[cardId]) cards[cardId] = sample.cards[cardId];
    }
  }

  const sidesInPeriod = resultsBetween(sides, period?.from, period?.to);
  const withDeck = shown.filter((result) => result.deckId && data.deckCards.has(result.deckId));

  return {
    games,
    game: { id: chosen.id, name: chosen.name, slug: chosen.slug, icon: chosen.icon },
    hasMeta,
    periods,
    ...(period ? { period } : {}),
    memberIds: [...new Set(data.results.map((result) => result.userId))],
    meta: computeGroupMeta(shown, data.cards, data.deckCards, reference),
    matchups: groupMatchups(sidesInPeriod, params.userId),
    cardStats: computeCardStats(
      withDeck.map((result) => toSampleDeck(result, data.deckCards.get(result.deckId as string))),
      data.cards,
    ),
    withCards: withDeck.length,
    cards,
    compared: Boolean(reference),
  };
}
