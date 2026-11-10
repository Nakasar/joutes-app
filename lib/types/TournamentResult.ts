/**
 * Le résultat d'un joueur à un tournoi.
 *
 * Il appartient au joueur, pas à un groupe : il apparaît dans tous ses groupes
 * de jeu, et pour tout le monde quand il est public. Trois sources :
 *
 * - `joutes` : écrit à la fin d'un tournoi Joutes, pour chaque joueur qui a un
 *   compte (`lib/tournaments/sync-results.ts`) ;
 * - `locator` : le joueur s'est reconnu (« C'est moi ») dans un tournoi
 *   importé du locator Riftbound ;
 * - `declared` : saisi par le joueur lui-même.
 */
export type TournamentResultSource = "joutes" | "locator" | "declared";

/** `groups` : les membres d'un groupe commun ; `public` : tout le monde. */
export type TournamentResultVisibility = "groups" | "public";

export type TournamentRecord = { wins: number; losses: number; draws: number };

export type TournamentResult = {
  id: string;
  userId: string;
  gameId?: string;
  /** Nom de jeu libre, pour un tournoi déclaré d'un jeu absent du catalogue. */
  gameName?: string;
  source: TournamentResultSource;
  /**
   * Ce qui rend le résultat unique pour son joueur : `joutes:<tournoi>`,
   * `locator:<tournoi importé>#<inscription>`, `declared:<id>`.
   */
  sourceRef: string;
  /**
   * Le tournoi lui-même, partagé par tous ses joueurs : `joutes:<tournoi>`,
   * `locator:<tournoi importé>`. Absent pour un tournoi déclaré, regroupé
   * alors par nom et date.
   */
  tournamentRef?: string;
  name: string;
  /** ISO 8601. */
  date: string;
  place?: string;
  playerCount?: number;
  /** 1 = vainqueur. Absent : « sans classement ». */
  placement?: number;
  /** Taille de la phase finale quand le joueur l'a jouée : 8 pour un top 8. */
  topCut?: number;
  record?: TournamentRecord;
  deckId?: string;
  deckVersion?: number;
  legendCardId?: string;
  legendName?: string;
  /** La légende et les domaines viennent du deck lié : ils le suivent quand il change. */
  legendFromDeck?: boolean;
  domains: string[];
  visibility: TournamentResultVisibility;
  /**
   * Un tournoi Joutes rouvert : son classement n'est plus final, le résultat
   * est caché jusqu'à la clôture mais garde le deck et la visibilité choisis.
   */
  provisional?: boolean;
  createdAt: string;
  updatedAt: string;
};
