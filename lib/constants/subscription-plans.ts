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
 * La bannière de vitrine suit la même règle et le même palier. La conception
 * l'avait placée sur Expert ; elle est ici sur Supporter parce que c'est ce que
 * dit le paragraphe ci-dessus — la cosmétique est le premier palier, et
 * personne qui paie davantage ne doit s'en trouver privé. La placer sur Expert
 * l'aurait retirée aux Supporters **et** aux Pro, Pro n'incluant pas Expert :
 * l'inverse de ce qu'on voulait. Si le produit tranche autrement, c'est une
 * ligne de cette table, et ce paragraphe à réécrire avec.
 *
 * **`permissions` est l'autre porte, et elle est volontairement dans l'espace de
 * noms d'à côté.** Un droit `sub:` ne s'accorde qu'en donnant le palier entier ;
 * une permission, elle, se pose aussi à la main sur un compte
 * (`user.permissions[]`). Certaines capacités ont besoin des deux chemins —
 * `trades:full_history` arrive avec Expert ou Pro, mais on veut pouvoir
 * l'accorder à une boutique partenaire sans abonnement. Ces chaînes-là sont donc
 * de vraies permissions, sans préfixe `sub:`, et `lib/db/permissions.ts` les
 * compose **en lecture** avec celles du document utilisateur.
 *
 * La séparation qui compte tient toujours : aucun abonnement n'**écrit** jamais
 * dans `user.permissions[]`. Une rétrogradation Patreon ne peut donc pas
 * effacer un droit accordé à la main — elle retire seulement ce que le palier
 * apportait de lui-même.
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
    entitlements: ["sub:profile-badge", "sub:profile-border", "sub:profile-banner"],
    permissions: [],
    tone: "silver",
  },
  expert: {
    label: "Joutes Expert",
    audience: "player",
    monthlyCents: 500,
    // Un abonnement joueur ne parraine aucun lieu.
    lairSeats: 0,
    includes: ["supporter"],
    entitlements: ["sub:poster-styles"],
    permissions: ["trades:full_history", "collection:advanced"],
    tone: "amethyst",
  },
  pro: {
    label: "Joutes Pro",
    audience: "organizer",
    monthlyCents: 1900,
    lairSeats: 1,
    includes: ["supporter"],
    // `sub:poster-styles` est répété et non hérité : Pro n'inclut pas Expert.
    // Une boutique compose ses affiches comme un joueur les siennes, et se
    // verrait sinon refuser sur son propre compte les styles que son lieu tient.
    entitlements: ["sub:lair-pro", "sub:poster-styles"],
    // Répétées et non héritées : Pro n'inclut pas Expert (deux publics, pas deux
    // barreaux). Une boutique qui tient l'historique de ses échanges, ou
    // plusieurs listes de souhaits, y a droit au même titre qu'un joueur.
    permissions: ["trades:full_history", "collection:advanced"],
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

/**
 * Les permissions qu'un palier apporte — dans l'espace de noms des permissions
 * accordées à la main, sans préfixe réservé. Voir l'en-tête du fichier.
 */
export type PlanPermission = (typeof SUBSCRIPTION_PLANS)[SubscriptionPlanKey]["permissions"][number];

export const ALL_PLAN_PERMISSIONS = [
  ...new Set(SUBSCRIPTION_PLAN_OPTIONS.flatMap((plan) => plan.permissions)),
].sort() as PlanPermission[];

/**
 * Vrai si cette permission peut venir d'un abonnement.
 *
 * Sert de garde-fou de performance à `hasPermission` : sans elle, vérifier
 * `erratas:manage` irait lire l'abonnement de l'appelant pour rien.
 */
export function isPlanPermission(permission: string): permission is PlanPermission {
  return (ALL_PLAN_PERMISSIONS as string[]).includes(permission);
}
