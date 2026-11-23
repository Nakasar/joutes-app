import type {DeckCardInfo, DeckCards} from "@/lib/decks/contents.ts";
import type {DeckZone} from "@/lib/decks/zones.ts";
import type {DeckVisibility} from "@/lib/types/Deck.ts";

/**
 * URI de la vue de l'éditeur de deck, déclarée par l'outil `open_deck_editor`.
 *
 * Elle porte un suffixe de version : un client garde la ressource en cache
 * sous son URI, et une vue dont le contrat change doit se recharger.
 */
export const DECK_EDITOR_VIEW_URI = "ui://joutes/deck-editor-v1.html";

/** Un deck de l'utilisateur, tel que la liste « Mes decks » le montre. */
export type DeckEditorSummary = {
  id: string;
  name: string;
  gameName?: string;
  gameSlug?: string;
  legendName?: string;
  coverImage?: string;
  size: number;
  compliant: boolean;
  updatedAt?: string;
};

/**
 * Un deck ouvert dans l'éditeur : son contenu, les zones de son jeu et ce que
 * l'éditeur doit savoir de chaque carte pour l'afficher et la ranger.
 *
 * Le même objet sort de `open_deck_editor` (premier affichage), de
 * `get_deck` et de chaque enregistrement : la vue n'a qu'une forme à lire.
 */
export type DeckEditorDeck = {
  id: string;
  name: string;
  gameId: string;
  gameName?: string;
  gameSlug: string;
  visibility: DeckVisibility;
  version: number;
  cards: DeckCards;
  zones: DeckZone[];
  /** Les cartes du deck, par identifiant. */
  catalog: DeckCardInfo[];
  /** Exemplaires possédés par l'utilisateur, par identifiant de carte. */
  owned: Record<string, number>;
  /** Exemplaires d'une même carte que le format permet, quand il en fixe un. */
  copyLimit?: number;
  updatedAt?: string;
  /** La fiche du deck et son éditeur sur Joutes. */
  url: string;
  editUrl: string;
};

/**
 * Ce que reçoit la vue en `structuredContent` : un deck à éditer, ou la liste
 * des decks de l'utilisateur quand aucun deck n'a été désigné (ouverture
 * depuis le point d'entrée de Claude).
 */
export type DeckEditorResult =
  | { mode: "deck"; deck: DeckEditorDeck }
  | { mode: "list"; decks: DeckEditorSummary[]; games: { slug: string; name: string }[] };

/** Une carte trouvée par la recherche de l'éditeur. */
export type DeckEditorSearchResult = {
  cards: (DeckCardInfo & { owned: number })[];
  total: number;
};

/** Ce que rend un enregistrement : le deck à jour, ou l'état qui l'a devancé. */
export type DeckEditorSaveResult =
  | { ok: true; deck: DeckEditorDeck }
  | { ok: false; conflict: true; deck: DeckEditorDeck };

/** Un changement demandé par nom de carte (outil `update_deck_cards`). */
export type DeckCardChange = {
  cardName: string;
  /** Exemplaires à ajouter (positif) ou à retirer (négatif). */
  quantity: number;
  /** Zone visée ; absente, la carte va là où son type la range. */
  zone?: string;
};

/** Ce que rend `update_deck_cards` à la vue, en plus du texte pour le modèle. */
export type DeckChangesResult = {
  deck: DeckEditorDeck;
  /** Le contenu d'avant, pour le bouton « Annuler ce changement ». */
  previousCards: DeckCards;
  /** Les changements appliqués, une ligne par carte : « +3 Void Seeker ». */
  applied: string[];
  /** Ce qui n'a pas pu s'appliquer (carte inconnue, zone inconnue). */
  skipped: string[];
};
