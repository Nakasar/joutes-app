/**
 * Participants d'une partie : les comptes, et les invités.
 *
 * Toutes les parties ne se jouent pas entre inscrits. Un adversaire croisé en
 * boutique, un ami qui n'a pas de compte, un enfant qui joue sur celui de son
 * parent : jusqu'ici il fallait soit ne pas les noter, soit leur inventer un
 * compte. Une partie porte donc aussi une liste d'**invités**, qui sont des
 * participants à part entière — ils peuvent gagner, recevoir des votes MVP,
 * aligner une liste d'armée et poser des jetons sur la table — mais **ne sont
 * pas des utilisateurs** : personne ne se connecte à leur place, et ils
 * n'existent que dans la partie où ils ont été saisis.
 *
 * Un identifiant d'invité est **préfixé** (`guest_…`) pour deux raisons :
 *
 *  - il ne peut jamais être confondu avec un `ObjectId` de compte, ni entrer
 *    par accident dans une requête qui en attend un ;
 *  - tout ce qui est indexé par participant — listes d'armée, decks, jetons de
 *    la table, vainqueurs — accepte les deux sortes de clés sans avoir à savoir
 *    laquelle est laquelle.
 *
 * Module pur, sans accès à la base : c'est ce qui le rend testable.
 */

import type { GameMatchGuest, GameMatchPlayer } from "@/lib/types/Match";

export const GUEST_ID_PREFIX = "guest_";

/** Au-delà, ce n'est plus une partie mais un annuaire. */
export const MAX_GUESTS = 20;

export const MAX_GUEST_NAME_LENGTH = 60;

/** Forme d'un identifiant d'invité, partagée avec le schéma de validation. */
export const GUEST_ID_PATTERN = /^guest_[A-Za-z0-9_-]{4,32}$/;

export function isGuestId(id: string): boolean {
  return GUEST_ID_PATTERN.test(id);
}

/**
 * Fabrique un identifiant d'invité à partir d'un suffixe tiré au sort par
 * l'appelant. Le tirage reste dehors : un module pur ne tire pas au sort, et
 * c'est ce qui permet de tester ce qui en dépend.
 */
export function guestId(suffix: string): string {
  return `${GUEST_ID_PREFIX}${suffix}`;
}

/**
 * Un participant, quelle que soit sa nature. C'est cette forme que l'affichage
 * manipule : une partie se lit comme une liste de joueurs, pas comme deux.
 */
export type MatchParticipant = {
  /** `userId` d'un compte, ou identifiant d'invité. */
  id: string;
  /** `displayName#discriminator` d'un compte, ou nom saisi pour un invité. */
  name: string;
  isGuest: boolean;
};

type ParticipantSource = {
  players?: GameMatchPlayer[];
  guests?: GameMatchGuest[];
};

/**
 * Les comptes d'abord, les invités ensuite. L'ordre n'est pas cosmétique : il
 * décide de la couleur attribuée à chacun sur la table de jeu, et déplacer un
 * participant dans la liste repeindrait ses jetons.
 */
export function matchParticipants(match: ParticipantSource): MatchParticipant[] {
  return [
    ...(match.players ?? []).map((player) => ({
      id: player.userId,
      name: player.username,
      isGuest: false,
    })),
    ...(match.guests ?? []).map((guest) => ({
      id: guest.id,
      name: guest.name,
      isGuest: true,
    })),
  ];
}

export function participantIds(match: ParticipantSource): string[] {
  return matchParticipants(match).map((participant) => participant.id);
}

export function isParticipant(match: ParticipantSource, id: string): boolean {
  return participantIds(match).includes(id);
}

/**
 * Nettoie une liste d'invités : noms débarrassés de leurs espaces, sans-noms
 * écartés, doublons d'identifiant retirés, et plafond appliqué.
 *
 * Deux invités peuvent porter le même nom — deux « Kévin » à la même table,
 * cela arrive, et ce sont bien deux joueurs distincts. C'est l'identifiant qui
 * les sépare, jamais le nom.
 */
export function normalizeGuests(guests: GameMatchGuest[] | undefined): GameMatchGuest[] {
  const seen = new Set<string>();
  const kept: GameMatchGuest[] = [];

  for (const guest of guests ?? []) {
    const id = guest.id?.trim();
    const name = guest.name?.trim().slice(0, MAX_GUEST_NAME_LENGTH);

    if (!id || !name || !isGuestId(id) || seen.has(id)) continue;

    seen.add(id);
    kept.push({ id, name });

    if (kept.length >= MAX_GUESTS) break;
  }

  return kept;
}
