import type { IndexDefinition } from "./ensure";

/**
 * Événements, lieux et jeux.
 *
 * Les événements sont identifiés par un `id` texte (UUID), pas par `_id`.
 * `startDateTime` est une chaîne ISO : les intervalles sont des comparaisons
 * de chaînes, qu'un index sert aussi bien que des dates.
 */
export const EVENT_INDEXES: IndexDefinition[] = [
  {
    collection: "events",
    keys: { id: 1 },
    why: "Toute lecture ou écriture d'un événement, et les `$lookup` des notifications",
  },
  {
    collection: "events",
    keys: { lairId: 1, startDateTime: 1 },
    why: "L'agenda d'un lieu ou de plusieurs (`$in` trié), les candidats liés de la page événement, la synchro des sources",
  },
  {
    collection: "events",
    keys: { startDateTime: 1 },
    why: "L'agenda du mois de l'accueil anonyme, et la recherche globale",
  },
  // `getEventsForUser` est un `$or` à quatre branches : MongoDB n'utilise un
  // index pour un `$or` que si **chaque** branche en a un. Il en faut donc un
  // par branche, sans quoi l'accueil connecté et les crons hebdomadaires
  // parcourent toute la collection.
  {
    collection: "events",
    keys: { creatorId: 1, startDateTime: 1 },
    why: "Branche « créés par moi » de l'agenda personnel",
  },
  {
    collection: "events",
    keys: { participants: 1, startDateTime: 1 },
    why: "Branche « j'y participe » de l'agenda personnel, et le décompte des présences",
  },
  {
    collection: "events",
    keys: { favoritedBy: 1, startDateTime: 1 },
    why: "Branche « favoris » de l'agenda personnel",
  },
  {
    collection: "events",
    keys: { linkedEventIds: 1 },
    options: { sparse: true },
    why: "Les événements liés, lus à chaque chargement de la page événement",
  },
  {
    collection: "events",
    keys: { boardsNeedsUpdate: 1 },
    options: { partialFilterExpression: { boardsNeedsUpdate: true } },
    why: "Le cron des tableaux Discord, qui ne veut que les événements marqués",
  },

  {
    collection: "event-guest-participants",
    keys: { eventId: 1 },
    why: "Les invités d'un événement (portail, transfert vers un tournoi)",
  },
  {
    collection: "event-guest-participants",
    keys: { id: 1 },
    why: "Le `$lookup` des matchs du portail vers leurs joueurs invités",
  },
  {
    collection: "event-announcements",
    keys: { eventId: 1, createdAt: -1 },
    why: "Les annonces d'un événement, des plus récentes aux plus anciennes",
  },
  {
    collection: "event-player-notes",
    keys: { eventId: 1, playerId: 1 },
    why: "La note d'un joueur, et son upsert",
  },
  {
    collection: "event-portal-settings",
    keys: { eventId: 1 },
    why: "Le réglage du portail, lu à chaque chargement de la page événement",
  },

  {
    collection: "lairs",
    keys: { location: "2dsphere" },
    why: "Les lieux proches (`$near`) de l'accueil et de la recherche",
  },
  {
    collection: "lairs",
    keys: { owners: 1 },
    why: "Les lieux d'un organisateur, et la branche « privé mais à moi » de la visibilité",
  },
  {
    collection: "lairs",
    keys: { invitationCode: 1 },
    options: { sparse: true },
    why: "L'accès à un lieu privé par son code d'invitation",
  },

  {
    collection: "games",
    keys: { slug: 1 },
    why: "`getGameBySlugOrId`, appelé par la plupart des routes d'API d'un jeu",
  },
  {
    collection: "games",
    keys: { name: 1 },
    why: "Le `$lookup` `gameName` → `name` de chaque liste d'événements",
  },
];
