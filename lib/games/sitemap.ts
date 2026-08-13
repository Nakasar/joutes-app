import type { GameFeatureKey } from "@/lib/constants/game-features";

/**
 * Pages d'un jeu à déclarer au sitemap.
 *
 * Le sitemap ne listait que les cartes, et une poignée de pages de riftbound
 * écrites à la main. Tout le reste — les outils qu'un jeu ouvre selon ses
 * fonctionnalités — n'était déclaré nulle part : un moteur ne les trouvait que
 * s'il suivait un lien depuis la fiche du jeu, et jamais pour les pages
 * qu'aucune barre d'outils ne pointe (les quiz, l'actualité).
 *
 * Deux règles tiennent cette liste :
 *
 *  - **on ne déclare que ce qui existe.** Un fanion allumé ouvre une page, et
 *    c'est cette page qu'on annonce ; une adresse qui répondrait 404 vaut moins
 *    que pas d'adresse du tout, un sitemap étant une promesse faite au moteur.
 *  - **on ne déclare que ce qui se lit sans compte.** La collection d'un jeu
 *    figure dans la barre d'outils, mais elle est personnelle : elle n'a rien à
 *    faire dans un index public.
 *
 * Module pur, sans accès à la base : la route lui passe ce qu'elle a lu, et
 * préfixe les chemins de son domaine.
 */

export type SitemapGame = {
  id: string;
  slug?: string | null;
  features?: Partial<Record<GameFeatureKey, boolean>>;
  /** Le jeu a au moins un quiz : sans quoi la page n'a rien à montrer. */
  hasQuizzes?: boolean;
  /** Le jeu a au moins une actualité. */
  hasNews?: boolean;
};

export type SitemapUrl = {
  /** Chemin absolu, sans domaine. */
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
};

/**
 * Outils d'un jeu, et le fanion qui ouvre chacun. L'ordre est celui de la barre
 * d'outils (`components/games/GameToolsNavBar.tsx`), dont cette table suit les
 * conditions : un outil déclaré ici sans être proposé là promettrait au moteur
 * une page que le jeu ne montre pas.
 *
 * Le vérificateur de deck n'y figure pas : sa page n'existe que pour riftbound
 * (route statique `app/games/riftbound/deck-checker`), pas sous
 * `[gameSlugOrId]`. Elle reste déclarée à la main tant qu'elle n'est pas
 * générique, plutôt que d'annoncer un 404 à tous les autres jeux.
 */
const GAME_TOOLS: { segment: string; feature: GameFeatureKey; priority: number }[] = [
  { segment: "cards", feature: "cards", priority: 0.6 },
  { segment: "rules", feature: "rules", priority: 0.5 },
  { segment: "policies", feature: "policies", priority: 0.5 },
  { segment: "cubes", feature: "cubes", priority: 0.4 },
  // Deux outils de manipulation des cartes : ils s'ouvrent avec elles.
  { segment: "loop", feature: "cards", priority: 0.3 },
  { segment: "scanner", feature: "cards", priority: 0.3 },
  { segment: "products", feature: "products", priority: 0.5 },
];

/**
 * Documents de règles, identiques pour tous les jeux qui ouvrent les règles
 * (`app/games/[gameSlugOrId]/rules/page.tsx`) : le règlement de tournoi et les
 * règles complètes.
 */
const RULES_DOCUMENTS = ["tr", "cr"];

/**
 * Pages publiques d'un jeu. Vide si le jeu n'a pas de slug : ses pages
 * répondent aussi sous son identifiant, mais une adresse technique n'a pas à
 * devenir l'adresse canonique d'un jeu dans un index public.
 */
export function gameSitemapUrls(game: SitemapGame): SitemapUrl[] {
  const slug = game.slug?.trim();
  if (!slug) return [];

  const base = `/games/${slug}`;
  const features = game.features ?? {};

  const urls: SitemapUrl[] = [
    { path: base, changeFrequency: "weekly", priority: 0.7 },
  ];

  for (const tool of GAME_TOOLS) {
    if (features[tool.feature]) {
      urls.push({ path: `${base}/${tool.segment}`, changeFrequency: "weekly", priority: tool.priority });
    }
  }

  if (features.rules) {
    for (const documentId of RULES_DOCUMENTS) {
      urls.push({ path: `${base}/rules/${documentId}`, changeFrequency: "weekly", priority: 0.5 });
    }
  }

  // Ni quiz ni actualité ne dépendent d'un fanion : ces pages s'ouvrent pour
  // tout jeu, et ne valent d'être annoncées que si elles ont du contenu. Une
  // page vide déclarée au sitemap est un rendez-vous manqué pour le moteur.
  if (game.hasQuizzes) {
    urls.push({ path: `${base}/quizz`, changeFrequency: "weekly", priority: 0.4 });
  }
  if (game.hasNews) {
    urls.push({ path: `${base}/news`, changeFrequency: "daily", priority: 0.5 });
  }

  return urls;
}

/**
 * Pages de tous les jeux, dans l'ordre où ils sont donnés. Les doublons de
 * chemin sont écartés (le premier gagne) : les pages écrites à la main dans la
 * route et celles calculées ici se recouvrent parfois, et un moteur qui lit
 * deux fois la même adresse n'y voit qu'un index mal tenu.
 */
export function gamesSitemapUrls(games: SitemapGame[]): SitemapUrl[] {
  const seen = new Set<string>();
  const urls: SitemapUrl[] = [];

  for (const game of games) {
    for (const url of gameSitemapUrls(game)) {
      if (seen.has(url.path)) continue;
      seen.add(url.path);
      urls.push(url);
    }
  }

  return urls;
}
