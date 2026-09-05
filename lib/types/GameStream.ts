/**
 * Le direct d'un éditeur, suivi depuis la fiche de son jeu.
 *
 * À ne pas confondre avec `StreamLink`, qui est la chaîne **d'une personne**,
 * liée depuis son compte et annoncée sur les vitrines qu'elle a choisies. Ici,
 * rien n'est lié et personne n'a d'OAuth : la chaîne est celle que
 * l'administration a collée dans `links.youtube` de la fiche du jeu, et sa
 * vitrine est le jeu lui-même.
 *
 * Cette différence explique la collection séparée. Le direct d'un éditeur
 * pourrait tenir dans le document du jeu — mais les jeux sont lus **en cache**
 * (`lib/db/games-cached.ts`, `cacheLife("days")`, invalidé à chaque édition
 * d'administration). Y écrire un état qui change toutes les heures reviendrait
 * à jeter le cache du catalogue entier chaque heure, pour un champ que trois
 * écrans regardent. La collection à part se lit fraîche, et le catalogue reste
 * froid.
 */

import type { Game } from "@/lib/types/Game";
import type { WatchedVideo } from "@/lib/types/StreamLink";

/**
 * Les plateformes suivies pour les jeux.
 *
 * Une seule aujourd'hui, et le champ existe quand même : Twitch se poserait à
 * côté sans rien déplacer, là où un document sans plateforme demanderait une
 * migration le jour où l'on en ajoute une.
 */
export type GameStreamPlatform = "youtube";

/** Le direct en cours d'une chaîne d'éditeur. */
export type GameLive = {
  /** L'adresse de lecture — celle que `readLiveEmbed` sait intégrer. */
  url: string;
  title?: string;
  /** ISO 8601 — le début donné par la plateforme quand elle le donne. */
  startedAt: string;
  /** L'identifiant de la vidéo YouTube. */
  videoId: string;
  /** ISO 8601 — quand nous l'avons vu démarrer, à un tour de cron près. */
  detectedAt: string;
};

export type GameStream = {
  id: string;
  gameId: Game["id"];
  platform: GameStreamPlatform;
  /**
   * L'adresse telle qu'elle est écrite sur la fiche du jeu.
   *
   * Gardée pour une seule raison : détecter qu'elle a changé. Une chaîne se
   * résout en un appel d'API, qu'il serait absurde de refaire toutes les heures
   * pour une valeur qui ne bouge jamais — mais qu'il faut refaire le jour où
   * l'administration corrige le lien.
   */
  sourceUrl: string;
  /** `UC…`, résolu une fois depuis `sourceUrl`. */
  channelId: string;
  channelTitle?: string;
  /** Le handle `@…` quand la chaîne en a un. */
  handle?: string;
  /**
   * Les vidéos dont l'état reste à surveiller.
   *
   * Même mécanique que pour les chaînes liées, et pour la même raison : le flux
   * public dit « quelque chose a été publié », pas « c'est un direct ». Un
   * direct programmé y apparaît des jours avant de commencer.
   */
  watched: WatchedVideo[];
  live?: GameLive | null;
  /** ISO 8601 — dernier tour de cron ayant regardé cette chaîne. */
  checkedAt?: string;
  /** Ce qui a empêché le dernier tour d'aboutir, affiché à l'administration. */
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};
