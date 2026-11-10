/**
 * Un deck partagé à un groupe de jeu.
 *
 * Un **lien**, pas une copie : le deck reste à son auteur, qui seul le
 * modifie, et le groupe en lit toujours la dernière version. Partager un deck
 * privé l'ouvre aux membres du groupe, et à eux seuls — il reste privé partout
 * ailleurs (`lib/decks/access.ts`).
 */
export type PlayGroupDeck = {
  playGroupId: string;
  deckId: string;
  /** Le jeu du deck, recopié : la vue filtre par jeu sans relire chaque deck. */
  gameId: string;
  /** L'auteur du deck : c'est lui qui l'emporte en quittant le groupe. */
  ownerId: string;
  addedBy: string;
  /** ISO 8601. */
  addedAt: string;
  /** Épinglé en tête de la bibliothèque par un admin du groupe. ISO 8601. */
  pinnedAt?: string;
  /** La raison de l'épinglage, en quelques mots — « prépa RQ Metz ». */
  pinNote?: string;
};
