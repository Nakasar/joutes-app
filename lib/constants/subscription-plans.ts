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
 * **`includes` porte la hiérarchie, et elle n'est pas une simple échelle.**
 * Expert et Pro incluent tous deux Supporter : la cosmétique est le premier
 * palier, et personne qui paie davantage ne doit s'en trouver privé. En revanche
 * Pro n'inclut **pas** Expert, et c'est délibéré — ce sont deux publics, un
 * joueur et un organisateur, pas les deux barreaux d'une même échelle. Une
 * boutique ne paie pas pour des statistiques de groupe de jeu. Si le produit en
 * décide autrement, cela reste un élément de tableau à ajouter.
 *
 * **`tone` est l'identité visuelle du palier**, et non un droit. Le contour
 * d'avatar et le badge se **dérivent** du palier affiché, ils ne sont pas
 * stockés : il n'y a donc aucune cosmétique à révoquer quand un abonnement
 * s'arrête. Le droit `sub:profile-border` dit « cet avatar a droit à un
 * contour », `tone` dit lequel.
 *
 * **Seuls les droits réellement lus par le code sont déclarés.** La tentation
 * est d'inscrire ici tout ce que les deux offres promettent un jour — l'IA, les
 * statistiques de groupe, la mise en avant d'évènements. Ce serait déclarer des
 * droits que rien ne vérifie : une page publique les afficherait comme acquis
 * alors qu'aucune route ne les consulte. Ils s'ajouteront un par un, avec la
 * fonctionnalité qui les lit.
 */

export const SUBSCRIPTION_PLANS = {
  supporter: {
    label: "Supporter",
    audience: "supporter",
    monthlyCents: 100,
    lairSeats: 0,
    // Vide : voir l'en-tête. Les clés y sont des clés de cette table même —
    // le test `subscription-plans.test.ts` le vérifie, faute de pouvoir le
    // typer sans que la table ne se référence circulairement.
    includes: [],
    entitlements: ["sub:profile-badge", "sub:profile-border"],
    tone: "silver",
  },
  expert: {
    label: "Joutes Expert",
    audience: "player",
    monthlyCents: 500,
    // Un abonnement joueur ne parraine aucun lieu.
    lairSeats: 0,
    includes: ["supporter"],
    entitlements: [],
    tone: "amethyst",
  },
  pro: {
    label: "Joutes Pro",
    audience: "organizer",
    monthlyCents: 1900,
    lairSeats: 1,
    includes: ["supporter"],
    entitlements: ["sub:lair-pro"],
    // Bleu nuit et non doré : Pro s'adresse à une boutique, pas au meilleur
    // joueur de la salle. Un contour doré se lirait comme un rang.
    tone: "midnight",
  },
} as const;

export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS;

/**
 * La teinte d'un palier, nommée plutôt que codée en couleurs.
 *
 * Les classes Tailwind vivent dans le composant qui rend le contour ; la table
 * ne connaît que l'intention. C'est ce qui permet d'ajuster une nuance sans
 * toucher à la déclaration des offres — et de garder cette table lisible par
 * quelqu'un qui n'écrit pas de CSS.
 */
export type SubscriptionPlanTone = (typeof SUBSCRIPTION_PLANS)[SubscriptionPlanKey]["tone"];

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
