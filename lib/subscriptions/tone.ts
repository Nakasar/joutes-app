import {
  SUBSCRIPTION_PLANS,
  isSubscriptionPlanKey,
  type SubscriptionPlanKey,
  type SubscriptionPlanTone,
} from "@/lib/constants/subscription-plans";

/**
 * L'apparence d'un palier : de la teinte nommée aux classes Tailwind.
 *
 * La table des offres ne connaît qu'une intention (« argent », « violet »,
 * « bleu nuit ») ; c'est ici que cette intention devient du style. Ajuster une
 * nuance ne touche donc pas à la déclaration des offres, et cette dernière reste
 * lisible par quelqu'un qui n'écrit pas de CSS.
 *
 * Les classes sont **écrites en toutes lettres**, jamais composées à la volée :
 * Tailwind lit le source pour décider quoi générer, et une classe construite par
 * concaténation n'existerait pas dans la feuille finale.
 */

export type PlanAppearance = {
  /** Anneau autour de l'avatar. */
  ring: string;
  /** Fond et texte du badge. */
  badge: string;
  /** Dégradé, pour les surfaces plus larges (carte d'offre). */
  gradient: string;
};

const APPEARANCES: Record<SubscriptionPlanTone, PlanAppearance> = {
  silver: {
    ring: "ring-slate-400/70 dark:ring-slate-300/60",
    badge:
      "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-400/40",
    gradient: "from-slate-300 to-slate-500",
  },
  amethyst: {
    ring: "ring-violet-500/70 dark:ring-violet-400/70",
    badge:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40",
    gradient: "from-violet-400 to-fuchsia-500",
  },
  midnight: {
    // Bleu nuit : Pro s'adresse à une boutique, pas au meilleur joueur de la
    // salle. Un anneau doré se lirait comme un rang.
    ring: "ring-indigo-800/80 dark:ring-indigo-400/70",
    badge:
      "bg-indigo-900/15 text-indigo-900 dark:bg-indigo-400/15 dark:text-indigo-200 border-indigo-800/40",
    gradient: "from-indigo-900 to-slate-700",
  },
};

export function appearanceForTone(tone: SubscriptionPlanTone): PlanAppearance {
  return APPEARANCES[tone];
}

/**
 * L'apparence d'un plan, ou `null` s'il n'y en a pas.
 *
 * `null` plutôt qu'une apparence neutre : l'appelant doit décider s'il rend un
 * avatar sans anneau ou pas de badge du tout, et une valeur par défaut le
 * priverait de ce choix.
 */
export function appearanceForPlan(plan: SubscriptionPlanKey | null): PlanAppearance | null {
  // `isSubscriptionPlanKey` et non `plan in SUBSCRIPTION_PLANS` : `in` remonte
  // la chaîne de prototypes, si bien que « toString » passerait le contrôle et
  // rendrait ensuite une apparence `undefined` — un avatar sans anneau, défaut
  // silencieux que seul quelqu'un qui paie pour le voir remarquerait.
  if (!plan || !isSubscriptionPlanKey(plan)) {
    return null;
  }

  return appearanceForTone(SUBSCRIPTION_PLANS[plan].tone);
}

/** Le libellé affiché sur le badge, tel que la table le déclare. */
export function labelForPlan(plan: SubscriptionPlanKey | null): string | null {
  if (!plan || !isSubscriptionPlanKey(plan)) {
    return null;
  }

  return SUBSCRIPTION_PLANS[plan].label;
}
