import type { SubscriptionPlanKey } from "@/lib/constants/subscription-plans";
import type { PatreonPatronStatus } from "@/lib/patreon/types";
import type { Lair } from "@/lib/types/Lair";
import type { User } from "@/lib/types/User";

/**
 * L'abonnement d'un compte, projeté depuis Patreon.
 *
 * C'est une **projection**, jamais une source : rien ici ne se décide, tout se
 * recopie depuis `currently_entitled_tiers`. D'où l'absence de toute date
 * d'expiration — Patreon garde le palier jusqu'à la fin de la période payée, et
 * le jour où il le retire, `plans` se vide. Il n'y a donc rien à faire expirer,
 * seulement un champ à relire.
 *
 * Le document vit dans une collection à part plutôt que sur le document
 * utilisateur, pour deux raisons. La collection `user` appartient à better-auth ;
 * et `lib/users/document.ts` documente le piège d'un champ ajouté au type mais
 * oublié dans `toUser()` — écrit en base, jamais relu, comme cela est arrivé aux
 * jeux favoris. Rester à côté écarte les deux problèmes.
 */

/**
 * Le lien entre un abonnement et un lieu de jeu qu'il parraine.
 *
 * Le siège vit dans le document d'abonnement et non sur le lieu : la borne
 * « N lieux au maximum » est un invariant de l'abonnement, et MongoDB ne sait
 * l'imposer sans course que si tout tient dans un seul document.
 */
export type SubscriptionSeat = {
  lairId: Lair['id'];
  attachedAt: Date;
  /** Le compte qui a rattaché ce lieu — pour l'audit, pas pour le droit. */
  attachedBy: User['id'];
};

/** Ce qui a écrit la projection en dernier. Diagnostic uniquement. */
export type SubscriptionSyncSource = "oauth-link" | "webhook" | "cron" | "manual";

export type Subscription = {
  id: string;
  userId: User['id'];
  provider: "patreon";

  /** Identifiant Patreon du compte lié — `account.accountId` chez better-auth. */
  providerUserId: string | null;
  /** Identifiant de l'adhésion à notre campagne. Absent tant qu'il n'y en a pas. */
  providerMemberId: string | null;

  /**
   * État résolu, la seule chose que l'application lit pour décider d'un droit.
   * Vide = plus aucun palier actif.
   */
  plans: SubscriptionPlanKey[];
  seats: SubscriptionSeat[];

  /**
   * État brut conservé tel que Patreon le donne : il permet de rejouer la
   * résolution après un changement de mapping, sans rappeler Patreon, et de
   * comprendre après coup pourquoi un compte a eu — ou n'a pas eu — un droit.
   */
  entitledTierIds: string[];
  entitledAmountCents: number;
  patronStatus: PatreonPatronStatus | null;
  lastChargeStatus: string | null;

  syncedAt: Date;
  syncSource: SubscriptionSyncSource;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Ce que l'écran « mon abonnement » a besoin de savoir, une fois les droits
 * calculés. Assemblé par `lib/subscriptions/access.ts`.
 */
export type SubscriptionSummary = {
  plans: SubscriptionPlanKey[];
  entitlements: string[];
  seats: SubscriptionSeat[];
  seatsTotal: number;
  seatsRemaining: number;
  linkedToProvider: boolean;
  patronStatus: PatreonPatronStatus | null;
  syncedAt: Date | null;
};
