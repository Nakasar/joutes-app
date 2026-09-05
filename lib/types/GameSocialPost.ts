/**
 * Une publication d'un compte d'éditeur, rapatriée sur la fiche de son jeu.
 *
 * À ne pas confondre avec `GameStream`, qui suit **un direct en cours** sur la
 * chaîne YouTube d'un éditeur : celui-ci est un état unique, éphémère, remplacé
 * toutes les heures. Ici, on accumule un historique borné — les cent dernières
 * publications d'un jeu, toutes plateformes mêlées.
 *
 * Comme `game_streams`, cela vit dans une collection à part et non sur le
 * document du jeu : le catalogue est servi en cache `cacheLife("days")`
 * (`lib/db/games-cached.ts`), et y écrire un état qui change deux fois par jour
 * reviendrait à jeter ce cache deux fois par jour.
 *
 * Voir `docs/GAME_SOCIAL.md`.
 */

import type { Game } from "@/lib/types/Game";
import type { SocialPlatform } from "@/lib/social/platforms";

export type { SocialPlatform };

/**
 * Ce qu'on montre d'une publication.
 *
 * `short` et `video` ne se distinguent que par la durée (seuil à trois
 * minutes), ce qui est une approximation assumée : la durée dit « format
 * court », pas « ceci est un Short ». Voir `lib/social/youtube-posts.ts`.
 */
export type SocialPostKind = "post" | "video" | "short";

/** Le compte à l'origine de la publication, tel que la vignette le nomme. */
export type SocialAccount = {
  /**
   * L'identité **stable** du compte chez sa plateforme : le DID chez Bluesky,
   * l'identifiant `UC…` chez YouTube.
   *
   * Ni le handle ni le nom d'affichage : les deux changent, et c'est sur cette
   * clé que le ménage reconnaît qu'un jeu a changé de compte.
   */
  key: string;
  /** `riftbound.bsky.social`, `@riftbound` — ce que la vignette écrit. */
  handle: string;
  displayName?: string;
  avatar?: string;
  /** L'adresse publique du compte, bâtie sur `key` et jamais sur `handle`. */
  url: string;
};

export type GameSocialPost = {
  id: string;
  gameId: Game["id"];
  platform: SocialPlatform;
  kind: SocialPostKind;
  /**
   * L'identifiant de la publication chez sa plateforme, **compte compris**.
   *
   * `did:plc:xxx/3mup…` chez Bluesky — le `rkey` seul n'est unique que dans un
   * dépôt, pas dans le réseau. `videoId` chez YouTube, qui est déjà global.
   *
   * Avec `gameId` et `platform`, c'est la clé unique de la collection, et donc
   * ce sur quoi la collecte fait son upsert.
   */
  externalId: string;
  /** Le permalien. Chez Bluesky, bâti sur le DID : un handle change. */
  url: string;
  account: SocialAccount;
  /** Le texte, tronqué à la collecte. Rendu en **texte brut**, jamais en HTML. */
  text?: string;
  thumbnail?: string;
  /**
   * ISO 8601 **normalisé en UTC** par `normalizeInstant` — c'est le tri.
   *
   * La normalisation n'est pas cosmétique : MongoDB trie une chaîne
   * lexicographiquement, et deux plateformes qui écrivent le même instant sous
   * deux formes différentes se rangeraient dans le désordre. Voir
   * `lib/social/instants.ts`.
   */
  publishedAt: string;
  durationSeconds?: number;
  /**
   * Présent = masquée par un administrateur, et le document devient une
   * **pierre tombale**.
   *
   * Son contenu ne sert plus à personne : sa seule fonction est d'occuper la
   * clé unique pour que la collecte suivante ne puisse pas ressusciter la
   * publication. Rien ne la supprime — ni la purge de rétention, ni le ménage,
   * ni un lien effacé puis remis. Seul un démasquage la rend de nouveau
   * ordinaire, donc purgeable.
   */
  hiddenAt?: string;
  hiddenBy?: string;
  /**
   * ISO 8601 — le tour qui a rangé cette publication.
   *
   * Pas « le dernier tour qui l'a revue » : une publication déjà connue n'est
   * pas réinterrogée, précisément pour ne pas dépenser du quota sur des valeurs
   * immuables. Ce champ date donc la découverte, pas la dernière vérification.
   */
  collectedAt: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Ce qu'un normalisateur pur produit : le document sans ce que la base y ajoute.
 *
 * `hiddenAt` et `hiddenBy` en sont **exclus par construction**, et c'est la
 * moitié de la garantie du masquage : un collecteur ne peut pas produire une
 * valeur pour un champ qu'il ne connaît pas. L'autre moitié est dans l'upsert
 * de `lib/db/game-social-posts.ts`, qui ne les écrit dans aucune clause.
 */
export type CollectedSocialPost = Omit<
  GameSocialPost,
  "id" | "gameId" | "hiddenAt" | "hiddenBy" | "createdAt" | "updatedAt"
>;
