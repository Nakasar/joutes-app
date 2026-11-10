/**
 * Un commentaire sur un deck.
 *
 * Il vit dans un **espace** : le fil d'un groupe de jeu (`group:<id>`, tout
 * membre lit et écrit tant que le deck est dans le groupe) ou l'espace
 * personnel de l'auteur du deck (`personal`). Un commentaire posté dans un
 * groupe reste dans ce groupe. Un futur partage ciblé ou public ajoutera un
 * espace, sans toucher aux autres (`lib/decks/comments.ts`).
 */
export type DeckCommentSpace = "personal" | `group:${string}`;

export type DeckComment = {
  id: string;
  deckId: string;
  space: DeckCommentSpace;
  authorId: string;
  /** Texte brut, 2 000 caractères au plus. */
  body: string;
  /** Les cartes visées : aucune pour un commentaire général, dix au plus. */
  cardIds: string[];
  /**
   * Le nom de chaque carte visée au moment de l'écriture : une carte retirée du
   * deck depuis ne se lit plus dans son catalogue, et le commentaire doit
   * pouvoir la nommer, barrée.
   */
  cardNames: Record<string, string>;
  /** La version du deck commentée. */
  deckVersion: number;
  /** Une réponse, à un seul niveau : l'identifiant du commentaire racine. */
  parentId?: string;
  /** ISO 8601. */
  resolvedAt?: string;
  resolvedBy?: string;
  /** La version du deck quand le commentaire a été résolu (« Résolu en v4 »). */
  resolvedVersion?: number;
  /** ISO 8601. */
  createdAt: string;
  editedAt?: string;
  /** Supprimé en douceur : une racine supprimée garde ses réponses. */
  deletedAt?: string;
};

/** Le dernier passage d'un lecteur sur un fil, pour les pastilles « nouveaux ». */
export type DeckCommentRead = {
  userId: string;
  deckId: string;
  space: DeckCommentSpace;
  /** ISO 8601. */
  lastReadAt: string;
};
