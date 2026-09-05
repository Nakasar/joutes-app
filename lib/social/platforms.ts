/**
 * Les plateformes dont on rapatrie les publications, et celles qu'on aimerait.
 *
 * Cette table **est** le point d'extension de la fonctionnalité. Il n'y a pas
 * de registre de collecteurs, et c'est délibéré : une interface
 * `collect(compte)` supposerait que les plateformes se sondent de la même
 * façon. Elles ne s'y sondent pas — Bluesky demande un aller-retour par compte,
 * YouTube un flux gratuit par chaîne **plus un unique `videos.list` pour tout
 * le catalogue**, et c'est ce lot partagé qui rend son quota tenable. Un cadre
 * commun devrait soit renoncer au lot, soit inventer un `gather()` puis un
 * `enrich()` pour un seul cas.
 *
 * L'orchestrateur (`lib/social/game-social.ts`) énumère donc ses passes en
 * clair, comme `refreshGameLives()` énumère les siennes. Ce que la table
 * apporte, c'est le vocabulaire : quelles plateformes existent, laquelle lit
 * quel lien de la fiche, et laquelle est réellement collectée.
 *
 * Voir `docs/GAME_SOCIAL.md`.
 */

import { GAME_LINKS, type GameLinkKey } from "@/lib/constants/game-links";

export type SocialPlatform = "bluesky" | "youtube" | "x" | "instagram";

export type SocialPlatformDefinition = {
  /** Le nom propre de la plateforme. Il ne se traduit pas, il ne passe donc pas par les messages. */
  label: string;
  /** La clé de `Game.links` qui porte le compte à sonder. */
  linkKey: GameLinkKey;
  /**
   * Sonde-t-on vraiment cette plateforme ?
   *
   * `false` ne dit pas « pas encore écrit », il dit **« pas accessible »** :
   *
   * - **X** n'a plus d'accès gratuit en lecture depuis février 2026. Il faut un
   *   compte développeur en paiement à l'usage.
   * - **Instagram** n'a pas d'API publique. `business_discovery` lirait un
   *   compte Business tiers, mais exige que Joutes possède son propre compte
   *   Instagram Business, une page Facebook liée, et une app Meta validée en
   *   App Review.
   *
   * Les deux sont bloquées sur des **démarches**, pas sur du code. Le jour où
   * elles aboutissent : cette ligne passe à `true`, un module pur de
   * normalisation, un module réseau, une passe de plus dans l'orchestrateur.
   * On n'écrit pas d'avance un client qui n'aura jamais tourné contre l'API
   * qu'il prétend parler.
   */
  collectable: boolean;
};

export const SOCIAL_PLATFORMS = {
  bluesky: { label: "Bluesky", linkKey: "bluesky", collectable: true },
  youtube: { label: "YouTube", linkKey: "youtube", collectable: true },
  x: { label: "X", linkKey: "x", collectable: false },
  instagram: { label: "Instagram", linkKey: "instagram", collectable: false },
} as const satisfies Record<SocialPlatform, SocialPlatformDefinition>;

export const SOCIAL_PLATFORM_KEYS = Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[];

/**
 * La définition d'une plateforme, sous son type déclaré.
 *
 * Même détour que `gameLink()` et pour la même raison : `as const` donne à
 * chaque entrée son type littéral, et l'accès par clé variable rendrait une
 * union dont les branches ne se lisent pas uniformément.
 */
export function socialPlatform(platform: SocialPlatform): SocialPlatformDefinition {
  return SOCIAL_PLATFORMS[platform];
}

/** Celles qu'un tour de collecte interroge réellement. */
export function collectableSocialPlatforms(): SocialPlatform[] {
  return SOCIAL_PLATFORM_KEYS.filter((platform) => SOCIAL_PLATFORMS[platform].collectable);
}

/**
 * Le lien de la fiche qui porte le compte de cette plateforme, s'il est rempli.
 *
 * Ne valide rien : c'est au lecteur de chaque plateforme de dire si l'adresse
 * désigne bien un compte (`readBlueskyActor`, `readYouTubeChannelRef`).
 */
export function socialLinkOf(
  links: Record<string, string | undefined> | undefined,
  platform: SocialPlatform,
): string | undefined {
  return links?.[SOCIAL_PLATFORMS[platform].linkKey]?.trim() || undefined;
}

/** Vrai si la clé de lien de cette plateforme existe bien dans `GAME_LINKS`. */
export function socialPlatformLinkExists(platform: SocialPlatform): boolean {
  return SOCIAL_PLATFORMS[platform].linkKey in GAME_LINKS;
}
