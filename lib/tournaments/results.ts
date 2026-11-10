import type {
  TournamentRecord,
  TournamentResult,
  TournamentResultVisibility,
} from "@/lib/types/TournamentResult";

/**
 * Les résultats de tournoi, en fonctions pures : le classement final d'un
 * tournoi Joutes, le bilan de chaque joueur, la saisie d'un résultat déclaré,
 * qui voit quoi, et la timeline d'un groupe.
 *
 * L'écriture et la lecture sont dans `lib/db/tournament-results.ts` et
 * `lib/tournaments/sync-results.ts`.
 */

// ---------------------------------------------------------------------------
// Tournois Joutes
// ---------------------------------------------------------------------------

export type PhaseStandings = {
  /** Rang de la phase dans le tournoi : la plus haute est la dernière jouée. */
  order: number;
  /** Le classement figé de la dernière ronde validée de la phase. */
  standings: { playerId: string }[];
};

/**
 * Le classement final d'un tournoi : la dernière phase classée d'abord (le
 * top cut), puis, phase par phase en remontant, les joueurs qu'elle n'a pas
 * gardés, dans leur ordre. Un joueur éliminé au top cut reste ainsi classé
 * selon les rondes suisses.
 *
 * `topCut` est la taille de la phase finale quand il y en a une, et
 * `inTopCut` ses joueurs.
 */
export function finalPlacements(phases: PhaseStandings[]): {
  order: string[];
  topCut?: number;
  inTopCut: Set<string>;
} {
  const ranked = phases.filter((phase) => phase.standings.length > 0).sort((a, b) => b.order - a.order);
  const order: string[] = [];
  const seen = new Set<string>();

  for (const phase of ranked) {
    for (const { playerId } of phase.standings) {
      if (!seen.has(playerId)) {
        seen.add(playerId);
        order.push(playerId);
      }
    }
  }

  const finalPhase = ranked[0];
  const hasCut = ranked.length > 1 && finalPhase && finalPhase.standings.length < order.length;

  return {
    order,
    ...(hasCut ? { topCut: finalPhase.standings.length } : {}),
    inTopCut: new Set(hasCut ? finalPhase.standings.map((standing) => standing.playerId) : []),
  };
}

export type RecordableMatch = {
  players: { playerId: string }[];
  winnerIds: string[];
  status: string;
  resolution?: string;
};

/**
 * Victoires, défaites et nuls de chaque joueur, sur les matchs terminés du
 * tournoi. Un bye (match à un joueur) ne compte pas ; une double défaite
 * compte une défaite pour chacun ; un match terminé sans vainqueur est nul.
 */
export function matchRecords(matches: RecordableMatch[]): Map<string, TournamentRecord> {
  const records = new Map<string, TournamentRecord>();
  const get = (playerId: string) => {
    const record = records.get(playerId) ?? { wins: 0, losses: 0, draws: 0 };
    records.set(playerId, record);
    return record;
  };

  for (const match of matches) {
    if (match.status !== "completed" || match.players.length < 2) continue;

    for (const { playerId } of match.players) {
      const record = get(playerId);
      if (match.resolution === "double-loss") {
        record.losses += 1;
      } else if (match.winnerIds.length === 0) {
        record.draws += 1;
      } else if (match.winnerIds.includes(playerId)) {
        record.wins += 1;
      } else {
        record.losses += 1;
      }
    }
  }

  return records;
}

/** Ce qu'un tournoi Joutes écrit pour un joueur ; le deck lié et la visibilité restent au joueur. */
export type JoutesResultDraft = Pick<
  TournamentResult,
  "userId" | "source" | "sourceRef" | "tournamentRef" | "name" | "date" | "playerCount" | "domains"
> &
  Partial<Pick<TournamentResult, "gameId" | "place" | "placement" | "topCut" | "record">>;

export function joutesSourceRef(tournamentId: string): string {
  return `joutes:${tournamentId}`;
}

/**
 * Un résultat par joueur avec compte. Un joueur absent du classement (inscrit
 * sans jamais jouer) n'en a pas : il n'a rien à montrer.
 */
export function buildJoutesResults(
  tournament: { id: string; name: string; gameId?: string; date: string; place?: string },
  players: { id: string; userId?: string }[],
  placements: ReturnType<typeof finalPlacements>,
  records: Map<string, TournamentRecord>,
): JoutesResultDraft[] {
  const rank = new Map(placements.order.map((playerId, index) => [playerId, index + 1]));
  const ref = joutesSourceRef(tournament.id);
  const seenUsers = new Set<string>();

  return players.flatMap((player) => {
    const placement = rank.get(player.id);
    // Un même compte inscrit deux fois (erreur de saisie) ne compte qu'une fois : la meilleure place.
    if (!player.userId || !placement || seenUsers.has(player.userId)) return [];
    seenUsers.add(player.userId);

    const record = records.get(player.id);
    return [
      {
        userId: player.userId,
        source: "joutes" as const,
        sourceRef: ref,
        tournamentRef: ref,
        name: tournament.name,
        date: tournament.date,
        playerCount: placements.order.length,
        domains: [],
        placement,
        ...(tournament.gameId ? { gameId: tournament.gameId } : {}),
        ...(tournament.place ? { place: tournament.place } : {}),
        ...(placements.inTopCut.has(player.id) && placements.topCut ? { topCut: placements.topCut } : {}),
        ...(record ? { record } : {}),
      },
    ];
  }).sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));
}

// ---------------------------------------------------------------------------
// Locator
// ---------------------------------------------------------------------------

export function locatorSourceRef(eventId: string, registrationId: number): string {
  return `locator:${eventId}#${registrationId}`;
}

/** `5-1-0` : victoires, défaites, nuls, tel que le locator l'écrit. */
export function parseRecord(value: string | undefined): TournamentRecord | undefined {
  const match = value?.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!match) return undefined;

  return { wins: Number(match[1]), losses: Number(match[2]), draws: Number(match[3] ?? 0) };
}

// ---------------------------------------------------------------------------
// Résultats déclarés
// ---------------------------------------------------------------------------

export const TOP_CUT_SIZES = [4, 8, 16, 32, 64] as const;

export type DeclaredResultInput = {
  name: string;
  date: string;
  gameId?: string;
  place?: string;
  playerCount?: number;
  placement?: number;
  topCut?: number;
  record?: TournamentRecord;
  deckId?: string;
  legendName?: string;
  visibility: TournamentResultVisibility;
};

export type DeclaredResultError =
  | "NAME"
  | "DATE"
  | "GAME"
  | "PLAYER_COUNT"
  | "PLACEMENT"
  | "TOP_CUT"
  | "RECORD"
  | "VISIBILITY";

function optionalInt(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function trimmed(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

/**
 * Ce qu'un joueur déclare, nettoyé. Le nom, la date et le jeu suffisent ; le
 * reste est facultatif. Un tournoi daté de demain au plus : on déclare ce
 * qu'on a joué, pas ce qu'on jouera.
 */
export function validateDeclaredResult(
  input: Record<string, unknown>,
  now: Date = new Date(),
): { ok: true; value: DeclaredResultInput } | { ok: false; error: DeclaredResultError } {
  const name = trimmed(input.name, 120);
  if (!name) return { ok: false, error: "NAME" };

  const date = typeof input.date === "string" ? new Date(input.date) : null;
  if (!date || Number.isNaN(date.getTime()) || date.getTime() > now.getTime() + 86_400_000 || date.getFullYear() < 1990) {
    return { ok: false, error: "DATE" };
  }

  const gameId = trimmed(input.gameId, 64);
  if (!gameId) return { ok: false, error: "GAME" };

  const playerCount = optionalInt(input.playerCount, 2, 20_000);
  if (playerCount === null) return { ok: false, error: "PLAYER_COUNT" };

  const placement = optionalInt(input.placement, 1, 20_000);
  if (placement === null || (placement && playerCount && placement > playerCount)) {
    return { ok: false, error: "PLACEMENT" };
  }

  const topCut = optionalInt(input.topCut, 2, 64);
  if (
    topCut === null ||
    (topCut !== undefined && !(TOP_CUT_SIZES as readonly number[]).includes(topCut)) ||
    (topCut && placement && placement > topCut)
  ) {
    return { ok: false, error: "TOP_CUT" };
  }

  let record: TournamentRecord | undefined;
  if (input.record !== undefined && input.record !== null) {
    const raw = input.record as Record<string, unknown>;
    const wins = optionalInt(raw.wins, 0, 50);
    const losses = optionalInt(raw.losses, 0, 50);
    const draws = optionalInt(raw.draws, 0, 50);
    if (wins === null || losses === null || draws === null) return { ok: false, error: "RECORD" };
    if (wins !== undefined || losses !== undefined || draws !== undefined) {
      record = { wins: wins ?? 0, losses: losses ?? 0, draws: draws ?? 0 };
    }
  }

  const visibility = input.visibility ?? "groups";
  if (visibility !== "groups" && visibility !== "public") return { ok: false, error: "VISIBILITY" };

  const place = trimmed(input.place, 120);
  const deckId = trimmed(input.deckId, 64);
  const legendName = trimmed(input.legendName, 120);

  return {
    ok: true,
    value: {
      name,
      date: date.toISOString(),
      gameId,
      visibility,
      ...(place ? { place } : {}),
      ...(playerCount ? { playerCount } : {}),
      ...(placement ? { placement } : {}),
      ...(topCut ? { topCut } : {}),
      ...(record ? { record } : {}),
      ...(deckId ? { deckId } : {}),
      ...(legendName ? { legendName } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Qui voit quoi
// ---------------------------------------------------------------------------

/**
 * Un résultat se voit par son joueur, par tout le monde s'il est public, et
 * par les membres d'un groupe qu'ils partagent sinon.
 */
export function canSeeResult(
  result: Pick<TournamentResult, "userId" | "visibility">,
  viewerId: string | null,
  sharesGroupWithOwner: boolean,
): boolean {
  if (viewerId && result.userId === viewerId) return true;
  if (result.visibility === "public") return true;

  return Boolean(viewerId) && sharesGroupWithOwner;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le tournoi d'un résultat : sa référence, sinon son nom et son jour. */
export function tournamentKey(result: Pick<TournamentResult, "tournamentRef" | "name" | "date">): string {
  return result.tournamentRef ?? `named:${normalizeName(result.name)}|${result.date.slice(0, 10)}`;
}

export type TimelineTournament<T extends TournamentResult = TournamentResult> = {
  key: string;
  name: string;
  date: string;
  gameId?: string;
  place?: string;
  playerCount?: number;
  source: TournamentResult["source"];
  /** Classés d'abord, du meilleur au moins bon ; les « sans classement » ensuite. */
  results: T[];
};

/**
 * Les résultats réunis par tournoi, du plus récent au plus ancien. Le nom,
 * le lieu et le nombre de joueurs viennent du résultat le plus complet.
 */
export function groupByTournament<T extends TournamentResult>(results: T[]): TimelineTournament<T>[] {
  const byKey = new Map<string, T[]>();
  for (const result of results) {
    const key = tournamentKey(result);
    byKey.set(key, [...(byKey.get(key) ?? []), result]);
  }

  return [...byKey]
    .map(([key, group]) => {
      const sorted = [...group].sort(
        (a, b) => (a.placement ?? Infinity) - (b.placement ?? Infinity) || a.userId.localeCompare(b.userId),
      );
      const reference = [...group].sort((a, b) => (b.playerCount ?? 0) - (a.playerCount ?? 0))[0];
      const place = group.find((result) => result.place)?.place;

      return {
        key,
        name: reference.name,
        date: reference.date,
        source: reference.source,
        ...(reference.gameId ? { gameId: reference.gameId } : {}),
        ...(place ? { place } : {}),
        ...(reference.playerCount ? { playerCount: reference.playerCount } : {}),
        results: sorted,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

/** Les tournois par mois (`2026-11`), dans l'ordre de la timeline. */
export function groupByMonth<T extends { date: string }>(tournaments: T[]): { month: string; tournaments: T[] }[] {
  const months: { month: string; tournaments: T[] }[] = [];
  for (const tournament of tournaments) {
    const month = tournament.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.month === month) {
      last.tournaments.push(tournament);
    } else {
      months.push({ month, tournaments: [tournament] });
    }
  }

  return months;
}

export type Palmares = { wins: number; podiums: number; topEights: number; tournaments: number };

/** La médaille d'une place : or, argent, bronze, ou rien au-delà du podium. */
export type Medal = "gold" | "silver" | "bronze";

export function medalFor(placement: number | undefined): Medal | undefined {
  return placement === 1 ? "gold" : placement === 2 ? "silver" : placement === 3 ? "bronze" : undefined;
}

/** Victoires, podiums, top 8 et tournois joués, sur un ensemble de résultats. */
export function summarizeResults(results: Pick<TournamentResult, "placement" | "tournamentRef" | "name" | "date">[]): Palmares {
  return {
    wins: results.filter((result) => result.placement === 1).length,
    podiums: results.filter((result) => result.placement !== undefined && result.placement <= 3).length,
    topEights: results.filter((result) => result.placement !== undefined && result.placement <= 8).length,
    tournaments: new Set(results.map(tournamentKey)).size,
  };
}

/**
 * Le résultat à montrer sur la carte d'un deck : le meilleur des six derniers
 * mois, sinon le plus récent.
 */
export function bestRecentResult<T extends Pick<TournamentResult, "placement" | "date">>(
  results: T[],
  now: Date = new Date(),
): T | undefined {
  if (results.length === 0) return undefined;

  const since = new Date(now.getTime() - 183 * 86_400_000).toISOString();
  const recent = results.filter((result) => result.date >= since && result.placement !== undefined);
  if (recent.length > 0) {
    return [...recent].sort((a, b) => a.placement! - b.placement! || b.date.localeCompare(a.date))[0];
  }

  return [...results].sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** `6-2-1`, ou `4-1` sans nul. */
export function formatRecord(record: TournamentRecord | undefined): string | undefined {
  if (!record) return undefined;

  return record.draws > 0 ? `${record.wins}-${record.losses}-${record.draws}` : `${record.wins}-${record.losses}`;
}

// ---------------------------------------------------------------------------
// « C'est moi »
// ---------------------------------------------------------------------------

/**
 * Un joueur du locator ressemble-t-il au compte ? Le locator écrit souvent
 * « Thomas D. » : même prénom, et même initiale quand il y a un nom. Ce n'est
 * qu'une suggestion, jamais un lien : le joueur confirme lui-même.
 */
export function looksLikeUser(playerName: string, userNames: string[]): boolean {
  const player = normalizeName(playerName).split(" ").filter(Boolean);
  if (player.length === 0) return false;

  return userNames.some((userName) => {
    const user = normalizeName(userName).split(" ").filter(Boolean);
    if (user.length === 0) return false;
    if (player.join(" ") === user.join(" ")) return true;
    if (player[0] !== user[0] || player[0].length < 2) return false;
    if (player.length === 1 || user.length === 1) return true;

    return player[1][0] === user[1][0];
  });
}

/** La phase finale d'un tournoi du locator, à la taille habituelle la plus proche au-dessus. */
export function topCutSize(players: number): number | undefined {
  if (players < 2) return undefined;
  return TOP_CUT_SIZES.find((size) => size >= players) ?? undefined;
}
