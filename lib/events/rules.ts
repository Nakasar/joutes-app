/**
 * Règles de la gestion des événements : qui peut faire quoi, et quand.
 *
 * Un événement traverse une vie courte mais réglée — on le crée, on l'ouvre
 * aux inscriptions, on le démarre, on le termine, parfois on l'annule — et
 * chaque étape ferme des portes : on ne rejoint pas une partie commencée, on
 * ne réduit pas la jauge en dessous du nombre de gens déjà inscrits, on
 * n'annule pas un événement terminé.
 *
 * Ces règles vivaient jusqu'ici *à l'intérieur* des actions serveur, entre un
 * appel à la session et un appel à la base. Elles n'étaient donc pas
 * vérifiables autrement qu'en montant une base et une session : les décisions
 * du domaine sont ici, dans un module pur, et les actions ne gardent que ce
 * qui est vraiment de leur ressort — lire la session, lire la base, écrire.
 *
 * Deux points méritent d'être connus avant de lire :
 *
 *  - **Le remplissage ne compte que les `REGISTERED`.** Un pré-inscrit
 *    (`PRE_REGISTERED`) occupe une place dans la liste mais pas dans la jauge,
 *    et un exclu (`EXCLUDED`) n'en occupe plus du tout. Un participant *sans*
 *    statut explicite est un inscrit : c'est le défaut d'`addParticipantToEvent`,
 *    et les événements créés avant la pré-inscription n'ont pas de table de
 *    statuts. D'où le `?? "REGISTERED"` de `countRegisteredParticipants`.
 *  - **L'ordre des refus est du domaine, pas du détail.** Un événement complet
 *    *et* déjà rejoint doit répondre « vous êtes déjà inscrit », pas « complet » ;
 *    c'est ce que l'utilisateur a besoin de lire. Les tests figent cet ordre.
 *
 * Les fonctions `can…` ne rendent pas un booléen mais un `RuleResult` : le
 * refus porte le message montré à l'utilisateur, en français, tel qu'il
 * s'affiche. Changer un de ces messages casse un test — c'est voulu, ce sont
 * des textes que quelqu'un lit.
 */

import { DateTime } from "luxon";
import type { Event, RegistrationStatus } from "@/lib/types/Event";

/** Verdict d'une règle : accordé, ou refusé avec le message à afficher. */
export type RuleResult = { ok: true } | { ok: false; error: string };

const OK: RuleResult = { ok: true };

function refuse(error: string): RuleResult {
  return { ok: false, error };
}

type OrganizerSource = Pick<Event, "creatorId" | "staff">;
type LifecycleSource = Pick<Event, "status" | "runningState">;
type ParticipationSource = Pick<
  Event,
  "participants" | "participantRegistrations" | "registeredParticipantsCount" | "maxParticipants"
>;

// =====================
// Rôles
// =====================

/**
 * Le créateur d'un événement en est organisateur d'office ; les autres le sont
 * par leur ligne de staff.
 *
 * Le test du créateur passe **avant** celui du staff : un événement qui n'a
 * jamais eu d'équipe n'a pas de tableau `staff`, et son créateur doit pouvoir
 * le gérer quand même.
 */
export function isEventOrganizer(event: OrganizerSource, userId?: string): boolean {
  if (!userId) return false;
  if (event.creatorId === userId) return true;
  return event.staff?.some((member) => member.userId === userId && member.role === "organizer") ?? false;
}

/** Membre de l'équipe, quel que soit son rôle — le créateur n'en fait pas partie. */
export function isEventStaff(event: Pick<Event, "staff">, userId?: string): boolean {
  if (!userId) return false;
  return event.staff?.some((member) => member.userId === userId) ?? false;
}

export function isEventParticipant(event: Pick<Event, "participants">, userId?: string): boolean {
  if (!userId) return false;
  return event.participants?.includes(userId) ?? false;
}

// =====================
// Remplissage
// =====================

/**
 * Nombre de places occupées : les participants dont le statut est `REGISTERED`,
 * statut absent compris (cf. l'en-tête du module).
 */
export function countRegisteredParticipants(
  event: Pick<Event, "participants" | "participantRegistrations">
): number {
  return (event.participants ?? []).filter(
    (userId) => (event.participantRegistrations?.[userId] ?? "REGISTERED") === "REGISTERED"
  ).length;
}

/**
 * Le décompte sur lequel les règles se prononcent. `getEventById` le calcule
 * déjà à la lecture ; on le reprend tel quel quand il est là, et on le
 * recalcule sinon — un événement venu d'une liste ne le porte pas toujours.
 */
function registeredCount(event: ParticipationSource): number {
  return event.registeredParticipantsCount ?? countRegisteredParticipants(event);
}

/** Sans jauge, un événement n'est jamais complet. */
export function isEventFull(event: ParticipationSource): boolean {
  if (!event.maxParticipants) return false;
  return registeredCount(event) >= event.maxParticipants;
}

/** Places restantes, ou `undefined` quand l'événement n'a pas de jauge. */
export function remainingSeats(event: ParticipationSource): number | undefined {
  if (!event.maxParticipants) return undefined;
  return Math.max(0, event.maxParticipants - registeredCount(event));
}

/** Un événement en pré-inscription ne donne pas la place, il la met en attente. */
export function resolveJoinRegistrationStatus(event: Pick<Event, "preRegistration">): RegistrationStatus {
  return event.preRegistration ? "PRE_REGISTERED" : "REGISTERED";
}

// =====================
// Inscriptions
// =====================

/** Un joueur s'inscrit lui-même. */
export function canJoinEvent(
  event: LifecycleSource & ParticipationSource & Pick<Event, "allowJoin">,
  userId: string
): RuleResult {
  if (!event.allowJoin) {
    return refuse("Les inscriptions à cet événement sont fermées");
  }

  if (event.runningState && event.runningState !== "not-started") {
    return refuse("Impossible de rejoindre un événement déjà commencé ou terminé");
  }

  if (isEventFull(event)) {
    return refuse("Cet événement est complet");
  }

  if (isEventParticipant(event, userId)) {
    return refuse("Vous êtes déjà inscrit à cet événement");
  }

  return OK;
}

/**
 * Un organisateur inscrit quelqu'un d'autre : `allowJoin` ne le concerne pas —
 * fermer les inscriptions ferme le formulaire public, pas la table de
 * l'organisateur — mais un événement commencé, si.
 *
 * Se lit avant la recherche du compte visé : c'est ce qui permet de répondre
 * « utilisateur introuvable » sur un tag inconnu plutôt que de commenter le
 * remplissage d'un événement auquel personne n'allait être ajouté.
 */
export function canAddParticipant(
  event: OrganizerSource & LifecycleSource,
  organizerId: string
): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent ajouter des participants");
  }

  if (event.runningState && event.runningState !== "not-started") {
    return refuse("Impossible d'ajouter des participants à un événement déjà commencé ou terminé");
  }

  return OK;
}

/** Second temps de l'ajout, une fois le compte visé retrouvé. */
export function canRegisterParticipant(event: ParticipationSource, userId: string): RuleResult {
  if (isEventFull(event)) {
    return refuse("Cet événement est complet");
  }

  if (isEventParticipant(event, userId)) {
    return refuse("Cet utilisateur est déjà inscrit à l'événement");
  }

  return OK;
}

/**
 * Changement de statut d'un participant par un organisateur.
 *
 * Seul le passage à `REGISTERED` prend une place, et seulement s'il ne l'avait
 * pas déjà : re-confirmer un inscrit sur un événement complet reste permis,
 * sans quoi la moindre correction serait bloquée dès la dernière place prise.
 */
export function canUpdateRegistrationStatus(
  event: OrganizerSource & ParticipationSource,
  organizerId: string,
  userId: string,
  status: RegistrationStatus
): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent modifier le statut d'inscription");
  }

  if (!isEventParticipant(event, userId)) {
    return refuse("Cet utilisateur n'est pas participant à l'événement");
  }

  if (status === "REGISTERED" && event.maxParticipants) {
    const alreadyRegistered = event.participantRegistrations?.[userId] === "REGISTERED";
    if (!alreadyRegistered && isEventFull(event)) {
      return refuse("Le nombre maximum de participants inscrits est atteint");
    }
  }

  return OK;
}

// =====================
// Dates
// =====================

/**
 * Un créneau tient debout : deux dates lisibles, et une fin strictement après
 * le début. Les formulaires envoient des `datetime-local` (`2026-08-20T14:00`),
 * qu'ISO 8601 accepte.
 */
export function checkEventSchedule(startDateTime: string, endDateTime: string): RuleResult {
  const start = DateTime.fromISO(startDateTime);
  const end = DateTime.fromISO(endDateTime);

  if (!start.isValid || !end.isValid) {
    return refuse("Les dates saisies ne sont pas valides");
  }

  if (start >= end) {
    return refuse("La date de fin doit être après la date de début");
  }

  return OK;
}

export type EventDetailsInput = {
  startDateTime: string;
  endDateTime: string;
  price?: number;
  maxParticipants?: number;
};

/**
 * Modification des informations d'un événement.
 *
 * La dernière règle est la seule qui regarde l'événement existant : abaisser
 * la jauge en dessous du nombre d'inscrits mettrait des gens dehors sans que
 * personne ne l'ait décidé.
 */
export function canUpdateEventDetails(
  event: OrganizerSource & ParticipationSource,
  organizerId: string,
  input: EventDetailsInput
): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent modifier ces informations");
  }

  const schedule = checkEventSchedule(input.startDateTime, input.endDateTime);
  if (!schedule.ok) return schedule;

  if (input.price !== undefined && input.price < 0) {
    return refuse("Le prix doit être supérieur ou égal à 0");
  }

  if (input.maxParticipants !== undefined && input.maxParticipants < 1) {
    return refuse("Le nombre de participants doit être supérieur ou égal à 1");
  }

  if (input.maxParticipants !== undefined && registeredCount(event) > input.maxParticipants) {
    return refuse("Le nombre max ne peut pas être inférieur au nombre de participants déjà inscrits");
  }

  return OK;
}

// =====================
// Cycle de vie
// =====================

export function canStartEvent(event: OrganizerSource & LifecycleSource, organizerId: string): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent démarrer l'événement");
  }

  if (event.runningState === "ongoing") {
    return refuse("L'événement est déjà en cours");
  }

  if (event.runningState === "completed") {
    return refuse("L'événement est déjà terminé");
  }

  return OK;
}

export function canCompleteEvent(event: OrganizerSource & LifecycleSource, organizerId: string): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent terminer l'événement");
  }

  if (event.runningState === "completed") {
    return refuse("L'événement est déjà terminé");
  }

  return OK;
}

/** Un événement en cours s'annule encore ; un événement terminé, non. */
export function canCancelEvent(event: OrganizerSource & LifecycleSource, organizerId: string): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent annuler l'événement");
  }

  if (event.status === "cancelled") {
    return refuse("L'événement est déjà annulé");
  }

  if (event.runningState === "completed") {
    return refuse("Impossible d'annuler un événement terminé");
  }

  return OK;
}

export function canDeleteEvent(event: OrganizerSource, organizerId: string): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent supprimer l'événement");
  }

  return OK;
}

// =====================
// Équipe
// =====================

/**
 * Ajout d'un membre à l'équipe, une fois le compte visé retrouvé. Le créateur
 * est déjà organisateur par nature : l'ajouter au staff lui donnerait un rôle
 * qu'on pourrait ensuite lui retirer, et donc le droit de se déposséder de son
 * propre événement.
 */
export function canAddStaffMember(event: OrganizerSource, userId: string): RuleResult {
  if (event.creatorId === userId) {
    return refuse("Le créateur ne peut pas être ajouté comme staff");
  }

  if (isEventStaff(event, userId)) {
    return refuse("Cet utilisateur fait déjà partie de l'équipe");
  }

  return OK;
}

export function canManageStaff(event: OrganizerSource, organizerId: string): RuleResult {
  if (!isEventOrganizer(event, organizerId)) {
    return refuse("Seuls les organisateurs de l'événement peuvent gérer l'équipe");
  }

  return OK;
}

// =====================
// Visibilité
// =====================

/**
 * Un événement sans lieu est un événement privé : connaître son identifiant ne
 * suffit pas à le lire, il faut l'avoir créé ou y participer. Les événements
 * rattachés à un lieu sont publics.
 */
export function canViewEvent(
  event: Pick<Event, "lairId" | "creatorId" | "participants">,
  userId?: string
): boolean {
  if (event.lairId) return true;
  if (!userId) return false;
  return event.creatorId === userId || isEventParticipant(event, userId);
}
