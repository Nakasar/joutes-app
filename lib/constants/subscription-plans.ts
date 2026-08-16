/**
 * Les abonnements de la plateforme, et les droits que chacun ouvre.
 *
 * Une seule table, comme pour les fonctionnalités d'un jeu : le type, la liste
 * des clés, les options d'affichage et le garde-type en descendent tous. Écrire
 * la liste deux fois, c'est la voir diverger.
 *
 * Trois partis pris méritent d'être expliqués ici, parce qu'ils se paient cher
 * si on les découvre plus tard.
 *
 * **Le préfixe `sub:` sur tout droit d'abonnement.** Pas `expert:` ni `pro:` :
 * déplacer une fonctionnalité d'un palier à l'autre doit coûter une ligne de
 * cette table, pas une migration des chaînes stockées. Et un préfixe réservé
 * rend impossible par construction toute collision avec les permissions
 * accordées à la main (`scanner:ai`, `policies:update`…), qui vivent dans un
 * système voisin mais distinct — voir `lib/db/permissions.ts`.
 *
 * **`includes` existe et reste vide.** « Pro inclut Expert » devient alors une
 * décision produit qui coûte un élément de tableau. Aujourd'hui ce sont deux
 * publics — un joueur, un organisateur — et non les deux barreaux d'une
 * échelle : personne ne doit payer Pro pour obtenir les outils de joueur.
 *
 * **Seuls les droits réellement lus par le code sont déclarés.** La tentation
 * est d'inscrire ici tout ce que les deux offres promettent un jour — l'IA, les
 * statistiques de groupe, la mise en avant d'évènements. Ce serait déclarer des
 * droits que rien ne vérifie : une page publique les afficherait comme acquis
 * alors qu'aucune route ne les consulte. Ils s'ajouteront un par un, avec la
 * fonctionnalité qui les lit.
 */

export const SUBSCRIPTION_PLANS = {
  expert: {
    label: "Joutes Expert",
    audience: "player",
    // Montant de départ, pas un tarif arrêté : il sert l'affichage et le seuil
    // de repli tant que les identifiants de paliers Patreon sont inconnus.
    monthlyCents: 300,
    // Un abonnement joueur ne parraine aucun lieu.
    lairSeats: 0,
    // Vide : voir l'en-tête. Les clés y sont des clés de cette table même —
    // le test `subscription-plans.test.ts` le vérifie, faute de pouvoir le
    // typer sans que la table ne se référence circulairement.
    includes: [],
    entitlements: ["sub:profile-badge", "sub:profile-border"],
  },
  pro: {
    label: "Joutes Pro",
    audience: "organizer",
    monthlyCents: 1000,
    lairSeats: 1,
    includes: [],
    entitlements: ["sub:profile-badge", "sub:lair-pro"],
  },
} as const;

export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS;

/**
 * L'ordre de déclaration fait foi : il est celui de la page d'offres, et sert
 * de départage à `displayPlan` quand un compte porte plusieurs plans.
 */
export const SUBSCRIPTION_PLAN_KEYS = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlanKey[];

export const SUBSCRIPTION_PLAN_OPTIONS = Object.entries(SUBSCRIPTION_PLANS).map(([value, plan]) => ({
  value: value as SubscriptionPlanKey,
  ...plan,
}));

export function isSubscriptionPlanKey(key: string): key is SubscriptionPlanKey {
  // `hasOwn` et non `in` : `in` remonte la chaîne de prototypes et ferait
  // passer « toString » pour un plan.
  return Object.hasOwn(SUBSCRIPTION_PLANS, key);
}

/** Préfixe réservé aux droits ouverts par un abonnement. */
export const ENTITLEMENT_PREFIX = "sub:";

export type EntitlementKey = (typeof SUBSCRIPTION_PLANS)[SubscriptionPlanKey]["entitlements"][number];

export const ALL_ENTITLEMENTS = [
  ...new Set(SUBSCRIPTION_PLAN_OPTIONS.flatMap((plan) => plan.entitlements)),
].sort() as EntitlementKey[];

export function isEntitlementKey(key: string): key is EntitlementKey {
  return (ALL_ENTITLEMENTS as string[]).includes(key);
}
