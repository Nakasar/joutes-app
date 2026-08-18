import type { Feat } from "@/lib/types/League";

/**
 * La règle qui décide si un haut fait rapporte ses points.
 *
 * Elle vivait jusqu'ici en quatre exemplaires, et trois d'entre eux étaient
 * faux : l'attribution manuelle et l'ajout d'un match ne regardaient que
 * `maxPerLeague`, la confirmation d'un match ne regardait rien du tout, et seul
 * `recalculateLeaguePoints` appliquait les deux limites. Les points d'un même
 * match changeaient donc au premier recalcul — ce qui ne se voit pas au moment
 * où l'erreur est commise, mais des semaines plus tard, sur un classement.
 *
 * Module pur : c'est la règle du jeu, elle se teste sans base.
 */

export type FeatAwardRefusal = "unknown-feat" | "max-per-event" | "max-per-league";

// L'acceptation porte le haut fait : l'appelant a besoin de son titre et de
// ses points juste après, et le recevoir ici lui évite de re-tester qu'il
// existe alors que la décision l'a déjà établi.
export type FeatAwardDecision =
  | { counted: true; feat: Feat }
  | { counted: false; reason: FeatAwardRefusal };

export type FeatAwardCounts = {
  /**
   * Fois où ce joueur détient déjà ce haut fait dans la ligue, cette
   * attribution non comprise.
   */
  inLeague: number;
  /**
   * Fois où ce haut fait lui a déjà été attribué dans le même match ou le même
   * événement, cette attribution non comprise. `maxPerEvent` s'y oppose.
   */
  inEvent: number;
};

/**
 * Décide du sort d'une attribution. Un refus n'efface pas le haut fait : il le
 * laisse enregistré sans points, ce que le modèle exprime déjà par
 * `MatchFeatAward.pointsCounted`. L'organisateur voit ainsi ce qui a été
 * décerné, et pourquoi ça n'a rien rapporté.
 */
export function decideFeatAward(
  feat: Feat | undefined,
  counts: FeatAwardCounts
): FeatAwardDecision {
  if (!feat) {
    return { counted: false, reason: "unknown-feat" };
  }
  if (feat.maxPerEvent !== undefined && counts.inEvent >= feat.maxPerEvent) {
    return { counted: false, reason: "max-per-event" };
  }
  if (feat.maxPerLeague !== undefined && counts.inLeague >= feat.maxPerLeague) {
    return { counted: false, reason: "max-per-league" };
  }
  return { counted: true, feat };
}

/** Message d'erreur pour les chemins qui refusent l'attribution plutôt que de
 * l'enregistrer sans points (attribution manuelle par un organisateur). */
export const FEAT_REFUSAL_MESSAGES: Record<FeatAwardRefusal, string> = {
  "unknown-feat": "Ce haut fait ne fait pas partie de la ligue",
  "max-per-event": "Limite de ce haut fait atteinte pour cet événement",
  "max-per-league": "Limite de ce haut fait atteinte pour la ligue",
};
