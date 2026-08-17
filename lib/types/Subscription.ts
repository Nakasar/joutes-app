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

/**
 * Un palier offert à la main par l'équipe : boutique partenaire, bêta-testeur,
 * remerciement. Il ouvre exactement les mêmes droits qu'un palier payé.
 *
 * Il vit **à côté** de `plans` et non dedans, parce que `plans` est réécrit en
 * bloc à chaque synchronisation Patreon : un octroi qui s'y trouverait
 * disparaîtrait au prochain webhook.
 *
 * C'est un enregistrement et non une simple clé, parce que la question « pourquoi
 * cette personne a-t-elle Pro gratuitement ? » se posera, et que sans `grantedBy`
 * ni `reason` personne ne saura y répondre six mois plus tard. Même forme que
 * `SubscriptionSeat` juste au-dessus.
 */
export type GrantedPlan = {
  plan: SubscriptionPlanKey;
  grantedAt: Date;
  /** Le compte administrateur qui a accordé le palier. */
  grantedBy: User['id'];
  /** Motif libre : « boutique partenaire », « bêta-testeur »… */
  reason: string;
};

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
   * Paliers offerts à la main. Ne viennent jamais de Patreon, et ne sont donc
   * jamais touchés par une synchronisation. Les droits effectifs sont l'union
   * de ceux-ci et de `plans` — voir `lib/subscriptions/grants.ts`.
   */
  grantedPlans: GrantedPlan[];

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
  /** Union effective : ce qui décide des droits, et ce que le badge affiche. */
  plans: SubscriptionPlanKey[];
  /**
   * La part venue de Patreon, et celle offerte par l'équipe. Distinguées pour
   * que l'écran ne dise pas « abonnement actif » à quelqu'un qui irait ensuite
   * chercher sur Patreon un prélèvement qui n'existe pas.
   */
  paidPlans: SubscriptionPlanKey[];
  grantedPlans: GrantedPlan[];
  entitlements: string[];
  seats: SubscriptionSeat[];
  seatsTotal: number;
  seatsRemaining: number;
  /**
   * Le compte Patreon est rattaché — d'après la collection `account` de
   * better-auth, seule autorité sur le lien lui-même.
   */
  linkedToProvider: boolean;
  /**
   * Patreon a rattaché une **adhésion à la campagne** à ce compte.
   *
   * Distinct de `linkedToProvider`, et pas seulement en théorie : lier un compte
   * qui n'est mécène de rien réussit parfaitement et ne rapporte aucune
   * adhésion. C'est le cas du porteur de la campagne, et de quiconque vient de
   * lier avant de choisir un palier. Se dérive de `providerMemberId`, seul champ
   * qui distingue « lecture aboutie » de « adhésion trouvée ».
   */
  hasProviderMembership: boolean;
  patronStatus: PatreonPatronStatus | null;
  syncedAt: Date | null;
};
