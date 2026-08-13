import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";

/**
 * Un participant de la partie, tel que l'affichage le lit : les comptes et les
 * invités y sont mêlés, `isGuest` faisant la différence.
 *
 * **`userId` n'est donc pas toujours l'identifiant d'un compte** : pour un
 * invité, c'est un identifiant local à la partie, préfixé `guest_`. Deux règles
 * en découlent, et elles ne souffrent pas d'exception :
 *
 *  - ce qui décide d'un **droit** ne se lit jamais ici, mais dans `playerIds`,
 *    qui ne contient que des comptes. Un identifiant d'invité n'appartient à
 *    personne : le confondre avec un compte donnerait à n'importe qui ce qu'il
 *    porte ;
 *  - ce qui va chercher un **utilisateur** (ses decks, son profil) écarte
 *    d'abord les invités : ils n'ont rien à y chercher.
 *
 * Voir `lib/matches/participants.ts`.
 */
export type GameMatchPlayer = {
  userId: User['id'];
  username: string; // displayName#discriminator ou username
  displayName?: string;
  discriminator?: string;
  /** Écrit seulement pour un invité, comme tous les fanions du dépôt. */
  isGuest?: boolean;
};

/**
 * Un participant sans compte. Son `id` est local à la partie et préfixé
 * (`guest_…`) : il n'est pas un utilisateur, personne ne s'y connecte, et il
 * n'existe que dans la partie où il a été saisi. Voir
 * `lib/matches/participants.ts`.
 */
export type GameMatchGuest = {
  id: string;
  name: string;
};

export type GameMatchRating = {
  userId: User['id'];
  rating: 1 | 2 | 3 | 4 | 5; // 1: angry, 2: sad, 3: neutral, 4: happy, 5: very happy
};

export type GameMatchMVPVote = {
  voterId: User['id'];
  votedForId: User['id'];
};

export type MatchFeatAward = {
  playerId: string; // Joueur qui a obtenu le haut fait
  featId: string;
  pointsCounted?: boolean; // Indique si les points ont été comptabilisés (false si limite atteinte)
};

/**
 * Une ligne de liste d'armée. `productId` désigne une figurine du catalogue du
 * jeu ; il est absent d'une ligne saisie librement (figurine convertie, sortie
 * trop récente pour le catalogue). Le `name` est écrit dans le rapport plutôt
 * que retrouvé par jointure : un rapport de bataille est une archive, il doit
 * rester lisible si le produit quitte le catalogue.
 *
 * Les règles de saisie vivent dans `lib/battle-reports/army.ts`.
 */
export type BattleReportArmyUnit = {
  productId?: string;
  name: string;
  /** Visuel du produit, dénormalisé comme le nom : il illustre le jeton sur la table. */
  image?: string;
  quantity: number;
};

/** Formes de décor posables sur la table. Volontairement peu nombreuses : on
 * note une position approximative, pas un plan d'architecte. */
export type BattleMapShape = 'circle' | 'rectangle' | 'triangle';

/**
 * Une pièce de décor. Tout est en centimètres, `x`/`y` désignant le **centre** —
 * c'est ce qu'on déplace au doigt, et ce qui reste juste quand la pièce change
 * de taille.
 */
export type BattleMapTerrain = {
  id: string;
  shape: BattleMapShape;
  name?: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Un jeton d'unité : toujours rond, à la couleur de son joueur, rattaché à une
 * ligne de sa liste d'armée. Le nom et l'image sont recopiés ici pour la même
 * raison que dans la liste — le rapport est une archive.
 */
export type BattleMapUnitToken = {
  id: string;
  playerId: User['id'];
  unitName: string;
  productId?: string;
  image?: string;
  x: number;
  y: number;
  /** Diamètre du socle, en centimètres. */
  diameter: number;
};

/** Un état de la table à un moment de la partie. */
export type BattleMapSnapshot = {
  id: string;
  label: string;
  /**
   * Ce qui s'est passé à cet instant, raconté par celui qui tient le rapport :
   * la charge qui a tout décidé, l'objectif pris, le jet raté. Les positions
   * montrent où étaient les unités, elles ne disent pas pourquoi.
   */
  notes?: string;
  units: BattleMapUnitToken[];
};

/**
 * La table vue de dessus. Le décor appartient à la table, les unités à
 * l'instant : un décor ne bouge pas de la partie, et le recopier dans chaque
 * instant obligerait à le corriger partout.
 */
export type BattleMap = {
  /** Dimensions du plateau, en centimètres. */
  table: { width: number; height: number };
  terrain: BattleMapTerrain[];
  snapshots: BattleMapSnapshot[];
  playerColors?: Record<User['id'], string>;
};

export type BattleReportArmy = {
  name?: string; // Nom de la liste, tel que le joueur l'appelle
  units: BattleReportArmyUnit[];
};

/**
 * Volet « rapport de bataille » d'une partie — les jeux de figurines racontent
 * une partie autrement qu'un jeu de cartes : ce qui compte n'est pas un deck
 * mais la liste posée sur la table, le scénario joué et le récit qu'on en fait.
 *
 * **La présence de cet objet fait la partie un rapport de bataille**, y compris
 * s'il est vide : le format est choisi à la création (automatiquement pour les
 * jeux qui activent la fonctionnalité `battleReports`), et il ne dépend pas du
 * fait qu'une note ait déjà été écrite.
 */
export type BattleReport = {
  scenario?: string; // Champ libre : les scénarios ne sont pas catalogués
  notes?: string; // Fiche de notes libres sur la partie
  armies?: Record<User['id'], BattleReportArmy>; // Liste jouée par chaque joueur
  map?: BattleMap; // Table de jeu vue de dessus, et ses instants
};

// Type de base pour tous les matchs
export type BaseMatch = {
  id: string;
  matchType: 'game' | 'league' | 'event';
  playedAt: Date;
  lairId?: Lair['id'];
  createdBy: User['id'];
  createdAt: Date;
  updatedAt?: Date;
  reportedBy?: User['id'];
  reportedAt?: Date;
  confirmedBy?: User['id'];
  confirmedAt?: Date;
};

// Match de jeu (hors ligue et événement)
export type GameTypeMatch = BaseMatch & {
  matchType: 'game';
  gameId: Game['id'];
  playerIds: User['id'][];
  players?: GameMatchPlayer[]; // Détails des joueurs (récupérés via aggregate)
  guests?: GameMatchGuest[]; // Participants sans compte
  ratings?: GameMatchRating[]; // Évaluations des joueurs
  mvpVotes?: GameMatchMVPVote[]; // Votes pour le MVP
  winnerIds?: User['id'][]; // IDs des gagnants désignés par le créateur
  decks?: Record<User['id'], string>; // Decks utilisés par chaque joueur { playerId: deckId }
  battleReport?: BattleReport; // Présent = la partie est saisie en rapport de bataille
};

// Match de ligue
export type LeagueTypeMatch = BaseMatch & {
  matchType: 'league';
  leagueId: string;
  gameId: Game['id'];
  playerIds: User['id'][]; // Tous les joueurs du match
  players?: GameMatchPlayer[]; // Détails des joueurs (récupérés via aggregate)
  playerScores?: Record<User['id'], number>; // Parties gagnées par joueur
  winnerIds: User['id'][]; // Les gagnants du match
  featAwards?: MatchFeatAward[]; // Hauts faits attribués lors du match
  notes?: string; // Notes optionnelles sur le match
  status?: "PENDING" | "REPORTED" | "CONFIRMED";
  confirmedPlayerIds?: User['id'][]; // Joueurs ayant confirmé le résultat
  lairConfirmedBy?: User['id'];
  targetId?: User['id']; // Pour les matchs de mode KILLER
  isKillerMatch?: boolean;
  lairName?: string;
  decks?: Record<User['id'], string>; // Decks utilisés par chaque joueur { playerId: deckId }
};

// Match d'événement (tournoi)
export type EventTypeMatch = BaseMatch & {
  matchType: 'event';
  eventId: string;
  phaseId: string;
  player1Id: User['id'];
  player2Id: User['id'] | null; // null pour un BYE
  player1Name?: string; // Nom du joueur 1 (ajouté par agrégation)
  player2Name?: string; // Nom du joueur 2 (ajouté par agrégation)
  player1Score: number;
  player2Score: number;
  winnerId?: User['id'] | null; // ID du gagnant
  round?: number; // Numéro de ronde (pour les rondes suisses)
  bracketPosition?: string; // Position dans le bracket (ex: "QF1", "SF1", "F")
  status: 'pending' | 'in-progress' | 'completed' | 'disputed';
  decks?: Record<User['id'], string>; // Decks utilisés par chaque joueur { playerId: deckId }
};

// Type union pour tous les types de matchs
export type Match = GameTypeMatch | LeagueTypeMatch | EventTypeMatch;

// Type guards pour différencier les types de matchs
export function isGameMatch(match: { matchType: Match['matchType'] }): match is GameTypeMatch {
  return match.matchType === 'game';
}

export function isLeagueMatch(match: { matchType: Match['matchType'] }): match is LeagueTypeMatch {
  return match.matchType === 'league';
}

export function isEventMatch(match: { matchType: Match['matchType'] }): match is EventTypeMatch {
  return match.matchType === 'event';
}

/**
 * Une partie est un rapport de bataille dès lors qu'elle en porte le volet —
 * même vide. Le format est une propriété de la partie, pas une conséquence de
 * ce qui a été rempli.
 */
export function isBattleReport(match: { battleReport?: BattleReport }): boolean {
  return match.battleReport !== undefined;
}

// Alias pour la rétrocompatibilité (à supprimer progressivement)
export type GameMatch = GameTypeMatch;
export type LeagueMatch = LeagueTypeMatch;
export type EventMatch = EventTypeMatch;
