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
