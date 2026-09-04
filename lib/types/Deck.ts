import type { DeckCards } from "@/lib/decks/contents";

/**
 * Qui voit le deck.
 *
 * `unlisted` est l'état intermédiaire : le deck s'ouvre par son lien, mais
 * n'apparaît ni dans la librairie publique ni dans les moteurs de recherche.
 * C'est ce qu'attend un joueur qui partage une liste à son groupe sans la
 * publier au monde entier.
 */
export type DeckVisibility = "private" | "unlisted" | "public";

/**
 * Section du guide de jeu d'un deck.
 *
 * Le guide n'est pas une seconde description : c'est une suite de passages
 * titrés — « Plan de jeu », « Ouvertures », « Séquence de combat » — que l'on
 * relit un par un. Les garder séparés permet de les éditer sur place, un à la
 * fois, plutôt que de rouvrir un pavé entier pour corriger une phrase.
 */
export type DeckGuideSection = {
  title: string;
  body: string;
};

/** Appréciation d'une confrontation face à un autre archétype. */
export type DeckMatchupRating = "favorable" | "even" | "unfavorable";

export type DeckMatchup = {
  name: string;
  rating: DeckMatchupRating;
};

export type Deck = {
  id: string;
  playerId: string;
  gameId: string;
  name: string;
  url?: string;
  description?: string;
  /**
   * Liste de cartes en texte libre, telle qu'elle existait avant l'éditeur.
   * Conservée : elle porte encore les decks des jeux sans catalogue de cartes,
   * et reste ce que l'on colle dans un client de jeu.
   */
  decklist?: string;
  /** Contenu structuré, zone par zone. Écrit par l'éditeur de deck. */
  cards?: DeckCards;
  /** Guide de jeu, par sections. */
  guide?: DeckGuideSection[];
  /** Confrontations documentées par l'auteur. */
  matchups?: DeckMatchup[];
  /** Notes privées de l'auteur : jamais servies à un visiteur. */
  notes?: string;
  /** Format de jeu visé (« Standard OGN »), tel que déclaré par la fiche du jeu. */
  format?: string;
  /** Carte qui donne son identité au deck (la légende, à Riftbound). */
  legendCardId?: string;
  /** Nom de cette carte au moment de l'enregistrement, pour l'afficher sans relire le catalogue. */
  legendName?: string;
  /**
   * Carte du deck choisie par l'auteur pour l'illustrer.
   *
   * Distincte de `legendCardId` : la carte qui donne son identité au deck n'est
   * pas toujours celle qui le montre le mieux, et un jeu sans zone « légende »
   * n'en a de toute façon aucune. Absente, la légende sert de couverture.
   */
  coverCardId?: string;
  /** Image de couverture déposée par l'auteur ; prime sur `coverCardId`. */
  coverImageUrl?: string;
  /**
   * Adresse de la couverture telle qu'elle s'affiche. **Valeur dérivée**,
   * réécrite à chaque enregistrement du contenu ou de la couverture : les
   * listes — accueil, librairie, mes decks — montrent une vignette par deck
   * sans avoir à résoudre le catalogue de cartes de chacun.
   */
  coverImage?: string;
  /**
   * Domaines couverts par les cartes du deck. Valeur dérivée, recalculée à
   * chaque enregistrement du contenu : la librairie s'y filtre sans avoir à
   * rejoindre le catalogue de cartes.
   */
  domains?: string[];
  visibility: DeckVisibility;
  creatorName?: string;
  favoritedBy?: string[];
  /** Nombre de mises en favori — dénormalisé, pour trier la librairie sans lire tout le tableau. */
  favoritesCount?: number;
  /** Consultations de la fiche par un autre que l'auteur. */
  views?: number;
  /** Numéro de version, incrémenté à chaque enregistrement du contenu. */
  version?: number;
  createdAt: Date;
  updatedAt: Date;
};

export const DECK_VISIBILITIES: DeckVisibility[] = ["private", "unlisted", "public"];

/**
 * Libellés et explications de la visibilité.
 *
 * Écrits une seule fois : le sélecteur de l'éditeur, le dialogue de partage et
 * les badges des listes disent tous la même chose du même état.
 */
export const DECK_VISIBILITY_LABELS: Record<DeckVisibility, { label: string; hint: string }> = {
  private: { label: "Privé", hint: "Visible uniquement par moi" },
  unlisted: { label: "Non répertorié", hint: "Accessible par lien, absent de la librairie" },
  public: { label: "Public", hint: "Visible par tous, listé dans la librairie" },
};

export const DECK_MATCHUP_LABELS: Record<DeckMatchupRating, string> = {
  favorable: "favorable",
  even: "équilibré",
  unfavorable: "défavorable",
};

/** Un deck non public ne s'indexe pas — ni le privé, ni celui qui n'est accessible que par lien. */
export function isDeckIndexable(visibility: DeckVisibility): boolean {
  return visibility === "public";
}
