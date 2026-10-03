import type { IndexDefinition } from "./ensure";

/**
 * Tournois, matchs et ligues.
 *
 * Les index uniques des tournois — rondes, puzzles, codes de participation et
 * d'écran de salle — sont posés au chargement de `lib/db/tournaments.ts` et
 * ne sont pas repris ici. Ceux-ci les complètent : l'index unique partiel de
 * `joinCode` ne sert pas la recherche `{ joinCode, status: { $ne } }`, dont le
 * filtre n'implique pas le sien.
 */
export const TOURNAMENT_INDEXES: IndexDefinition[] = [
  {
    collection: "tournaments",
    keys: { joinCode: 1, status: 1 },
    why: "/t/[code] et l'inscription : un code, hors tournois terminés, puis sans filtre",
  },
  {
    collection: "tournaments",
    keys: { liveCode: 1, status: 1 },
    why: "/t/[code] côté écran de salle",
  },
  {
    collection: "tournaments",
    keys: { organizerIds: 1, createdAt: -1 },
    why: "Les tournois d'un organisateur, du plus récent au plus ancien",
  },
  {
    collection: "tournaments",
    keys: { eventId: 1, createdAt: -1 },
    why: "Le tournoi rattaché à un événement",
  },
  {
    collection: "tournaments",
    keys: { leagueId: 1, createdAt: -1 },
    why: "Les tournois d'une ligue",
  },

  {
    collection: "tournament-players",
    keys: { tournamentId: 1, seed: 1, createdAt: 1 },
    why: "La liste des joueurs, triée, lue par le classement et l'écran de salle",
  },
  {
    collection: "tournament-players",
    keys: { tournamentId: 1, userId: 1 },
    why: "« Suis-je inscrit ? » : contrôle d'accès et inscription",
  },
  {
    collection: "tournament-players",
    keys: { userId: 1 },
    why: "Les tournois d'un joueur",
  },
  {
    collection: "tournament-players",
    keys: { syncKey: 1 },
    options: { sparse: true },
    why: "L'authentification de chaque appel d'API joueur (`Bearer tpsk_…`)",
  },
  {
    collection: "tournament-phases",
    keys: { tournamentId: 1, order: 1, createdAt: 1 },
    why: "Les phases d'un tournoi, dans l'ordre",
  },
  {
    collection: "tournament-rounds",
    keys: { tournamentId: 1, number: 1 },
    why: "Les rondes d'un tournoi",
  },
  {
    collection: "tournament-rounds",
    keys: { status: 1, deadlineAt: 1 },
    why: "Le cron des échéances : rondes en cours dont l'échéance est passée",
  },
  {
    collection: "tournament-matches",
    keys: { tournamentId: 1, roundId: 1, createdAt: 1, _id: 1 },
    why: "Les tables d'une ronde, dans l'ordre ; le préfixe sert les lectures par tournoi",
  },
  {
    collection: "tournament-matches",
    keys: { tournamentId: 1, phaseId: 1, createdAt: 1, _id: 1 },
    why: "Les matchs d'une phase",
  },
  {
    collection: "tournament-matches",
    keys: { roundId: 1, status: 1 },
    why: "Le cron des échéances et les résumés, qui partent des rondes sans tournoi",
  },
  {
    collection: "tournament-announcements",
    keys: { tournamentId: 1, createdAt: -1 },
    why: "Les annonces d'un tournoi",
  },
  {
    collection: "tournament-activity",
    keys: { tournamentId: 1, createdAt: -1 },
    why: "Le fil d'activité, interrogé en boucle, et sa purge à chaque écriture",
  },
  {
    collection: "tournament-penalties",
    keys: { tournamentId: 1, playerId: 1, createdAt: -1 },
    why: "Les pénalités d'un tournoi ou d'un joueur",
  },
  {
    collection: "tournament-notes",
    keys: { tournamentId: 1, playerId: 1, createdAt: -1 },
    why: "Les notes d'organisateur sur un joueur",
  },
  {
    collection: "tournament-feat-awards",
    keys: { tournamentId: 1, playerId: 1 },
    why: "Les hauts faits d'un joueur dans un tournoi",
  },
  {
    collection: "tournament-feat-awards",
    keys: { tournamentId: 1, matchId: 1 },
    why: "Le retrait des hauts faits d'un match corrigé",
  },
  {
    collection: "tournament-puzzle-results",
    keys: { tournamentId: 1, phaseId: 1, durationSeconds: 1 },
    why: "Le classement d'une phase puzzle",
  },

  {
    collection: "matches",
    keys: { leagueId: 1, matchType: 1, playedAt: -1 },
    why: "Les matchs d'une ligue, lus à chaque chargement d'une ligue",
  },
  // L'historique des parties d'un joueur est un `$or` : une branche, un index.
  {
    collection: "matches",
    keys: { playerIds: 1, playedAt: -1 },
    why: "Historique des parties : branche « j'ai joué »",
  },
  {
    collection: "matches",
    keys: { createdBy: 1, playedAt: -1 },
    why: "Historique des parties : branche « j'ai saisi »",
  },
  {
    collection: "matches",
    keys: { player1Id: 1 },
    options: { sparse: true },
    why: "Historique des parties : branche du joueur 1 des anciens matchs de portail",
  },
  {
    collection: "matches",
    keys: { player2Id: 1 },
    options: { sparse: true },
    why: "Historique des parties : branche du joueur 2 des anciens matchs de portail",
  },
  {
    collection: "matches",
    keys: { eventId: 1, phaseId: 1, round: 1 },
    why: "Les matchs de l'ancien portail d'événement",
  },

  {
    collection: "leagues",
    keys: { invitationCode: 1 },
    options: { sparse: true },
    why: "Rejoindre une ligue par son code",
  },
  {
    collection: "leagues",
    keys: { isPublic: 1, status: 1, createdAt: -1 },
    why: "La liste publique des ligues",
  },
  {
    collection: "leagues",
    keys: { creatorId: 1, createdAt: -1 },
    why: "Ligues gérées : branche « créées par moi »",
  },
  {
    collection: "leagues",
    keys: { organizerIds: 1, createdAt: -1 },
    why: "Ligues gérées : branche « j'organise »",
  },
  {
    collection: "league-participants",
    keys: { leagueId: 1, userId: 1 },
    why: "Un participant d'une ligue (une vingtaine d'appels), et le `$lookup` des ligues",
  },
  {
    collection: "league-participants",
    keys: { userId: 1 },
    why: "Les ligues d'un joueur",
  },
  {
    collection: "league-participant-feats",
    keys: { leagueId: 1, userId: 1, earnedAt: -1 },
    why: "Les hauts faits d'un participant, lus pour chacun à l'affichage d'une ligue",
  },
  {
    collection: "league-participant-feats",
    keys: { leagueId: 1, tournamentId: 1 },
    why: "L'apport d'un tournoi à une ligue, appliqué ou retiré",
  },
];
