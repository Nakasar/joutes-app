import type { GameFeatureKey } from "@/lib/constants/game-features";

/**
 * Ce que le menu « Jeux » de la barre de navigation propose.
 *
 * Le menu déroulant est un raccourci vers ce qu'on ouvre tous les jours, pas un
 * catalogue. Trois sources, de la plus personnelle à la plus générique :
 *
 *  1. les **favoris** — les jeux que l'utilisateur a marqués parmi ceux qu'il
 *     suit. C'est le seul choix explicite, il passe donc avant tout ;
 *  2. à défaut, ses **jeux suivis** — un choix, mais moins précis : on suit un
 *     jeu pour son actualité sans forcément vouloir ses outils sous la main ;
 *  3. à défaut encore, les jeux **par défaut** de la plateforme, pour que le
 *     menu ne soit jamais vide, y compris pour un visiteur non connecté.
 *
 * Quand la sélection se réduit à **un seul jeu**, la liste n'a plus d'intérêt :
 * elle ne proposerait qu'un clic de plus vers ce jeu. Le menu montre alors
 * directement ses outils.
 *
 * Module pur, sans accès à la base ni à React : c'est ce qui le rend testable.
 */

export type NavGame = {
  id: string;
  name: string;
  slug?: string | null;
  features?: Partial<Record<GameFeatureKey, boolean>>;
};

/** D'où vient ce que le menu affiche — l'appelant en tire ou non un bouton. */
export type GamesMenuSource = "favorites" | "followed" | "defaults";

export type GamesMenuSelection = {
  source: GamesMenuSource;
  games: NavGame[];
};

/**
 * Les jeux à montrer, et à quel titre. `favoriteIds` peut désigner des jeux
 * qui ne sont plus suivis (un jeu retiré des suivis, une base ancienne) : ils
 * sont ignorés, un favori n'ayant de sens que parmi les jeux suivis.
 */
export function selectMenuGames({
  followed,
  favoriteIds,
  defaults,
}: {
  followed: NavGame[];
  favoriteIds: string[];
  defaults: NavGame[];
}): GamesMenuSelection {
  const favorites = followed.filter((game) => favoriteIds.includes(game.id));
  if (favorites.length > 0) return { source: "favorites", games: favorites };
  if (followed.length > 0) return { source: "followed", games: followed };
  return { source: "defaults", games: defaults };
}

/**
 * Vrai quand le menu doit montrer les outils d'un jeu plutôt qu'une liste.
 *
 * Les jeux par défaut en sont exclus : ils ne sont le choix de personne, et
 * réduire la navigation d'un visiteur aux outils d'un jeu qu'il n'a pas
 * demandé l'enfermerait dans un jeu au hasard.
 */
export function showsGameTools(selection: GamesMenuSelection): boolean {
  return selection.source !== "defaults" && selection.games.length === 1;
}

/**
 * Clé d'un outil, telle que l'appelant la traduit et l'illustre. Les valeurs
 * suivent les fanions de `lib/constants/game-features.ts`, `hub` en plus pour
 * la fiche du jeu elle-même.
 */
export type GameToolKey =
  | "hub"
  | "cards"
  | "tournaments"
  | "products"
  | "battleReports"
  | "collection"
  | "rules"
  | "policies"
  | "cubes"
  | "deckChecker";

export type GameToolLink = {
  key: GameToolKey;
  href: string;
};

/**
 * Les outils d'un jeu, dans l'ordre où sa fiche les présente et sous les mêmes
 * conditions : un fanion éteint ferme la page autant que la tuile, et un menu
 * qui y mènerait quand même promettrait ce que le jeu n'a pas.
 *
 * Les liens passent par le slug quand il existe, sinon par l'identifiant : les
 * routes acceptent les deux (`getGameBySlugOrId`), et tous les jeux n'ont pas
 * de slug.
 */
export function gameToolLinks(game: NavGame): GameToolLink[] {
  const path = game.slug ?? game.id;
  const features = game.features ?? {};

  const tools: GameToolLink[] = [{ key: "hub", href: `/games/${path}` }];

  if (features.cards) tools.push({ key: "cards", href: `/games/${path}/cards` });
  if (features.tournaments) tools.push({ key: "tournaments", href: `/games/${path}/tournaments` });
  if (features.products) tools.push({ key: "products", href: `/games/${path}/products` });
  // Le formulaire d'une partie prend l'identifiant, pas le slug.
  if (features.battleReports) tools.push({ key: "battleReports", href: `/game-matches/new?gameId=${game.id}` });
  if (features.collection) tools.push({ key: "collection", href: `/collection/${path}` });
  if (features.rules) tools.push({ key: "rules", href: `/games/${path}/rules` });
  if (features.policies) tools.push({ key: "policies", href: `/games/${path}/policies` });
  if (features.cubes) tools.push({ key: "cubes", href: `/games/${path}/cubes` });
  if (features.deckChecker) tools.push({ key: "deckChecker", href: `/games/${path}/deck-checker` });

  return tools;
}
