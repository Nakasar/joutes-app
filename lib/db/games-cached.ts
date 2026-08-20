import { cacheLife, cacheTag } from "next/cache";
import { getAllGames, getGameBySlugOrId } from "./games.ts";
import type { Game } from "@/lib/types/Game.ts";

/**
 * Lectures publiques du catalogue de jeux, mises en cache.
 *
 * Un jeu ne change que lorsque l'administration l'édite : ces lectures n'ont
 * aucune raison de repartir en base à chaque visite. Mises en cache, elles
 * permettent aux pages publiques de prérendre au lieu de rendre à la requête.
 *
 * Elles vivent à côté des lectures brutes plutôt qu'à leur place : l'admin, qui
 * vient d'écrire, doit continuer à lire la base directement. Seules les pages
 * publiques passent par ici.
 *
 * La fraîcheur ne repose pas sur l'échéance mais sur l'étiquette : les actions
 * d'administration appellent `updateTag(GAMES_CACHE_TAG)` après chaque écriture,
 * si bien qu'une modification est visible dès la requête suivante. `cacheLife`
 * n'est que le filet de sécurité si une écriture passait un jour à côté.
 *
 * ## Le build dépend désormais de la base
 *
 * Rendre une page statique, c'est la prérendre **pendant `next build`** : ces
 * lectures s'exécutent donc au build, et plus seulement à la requête. Trois
 * conséquences à connaître avant d'étendre ce motif à d'autres lectures :
 *
 * - **MongoDB doit être joignable depuis l'infrastructure de build**, pas
 *   seulement depuis celle d'exécution. Vérifié sur Vercel : le déploiement de
 *   preview de #247 prérend `/games` sans que l'allowlist Atlas ait eu besoin
 *   d'être élargie.
 * - **Une coupure passagère de la base fait échouer le build**, là où le rendu à
 *   la requête l'aurait absorbée. C'est arrivé une fois en local
 *   (`MongoTopologyClosedError`), et le build suivant est passé sans rien
 *   changer.
 * - **Un environnement sans base ne construit plus ces pages.** Un build hors
 *   ligne ou sur une base vide sort une coquille sans contenu plutôt qu'une
 *   erreur — d'où la règle du document d'adoption : toujours construire avec des
 *   données.
 */
export const GAMES_CACHE_TAG = "games";

/** Le catalogue complet, tel que l'explorateur de jeux l'affiche. */
export async function readAllGames(): Promise<Game[]> {
  "use cache";
  cacheLife("days");
  cacheTag(GAMES_CACHE_TAG);

  return getAllGames();
}

/**
 * Un jeu par son slug ou son identifiant. L'argument fait partie de la clé de
 * cache, donc chaque jeu a son entrée ; l'étiquette commune les invalide toutes
 * d'un coup, ce qui est le bon grain pour une administration qui édite un jeu à
 * la fois.
 */
export async function readGameBySlugOrId(slugOrId: string): Promise<Game | null> {
  "use cache";
  cacheLife("days");
  cacheTag(GAMES_CACHE_TAG);

  return getGameBySlugOrId(slugOrId);
}
