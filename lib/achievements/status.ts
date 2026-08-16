import type { AchievementWithUnlockInfo } from "@/lib/types/Achievement";
import { DEFAULT_STATUS_TONE, isStatusTone, type StatusTone } from "./status-tone";

/**
 * Les statuts qu'un compte porte, tirés de ses succès.
 *
 * Un statut n'est pas une notion séparée : c'est un succès marqué comme tel. Le
 * catalogue, l'attribution et le retrait sont donc déjà écrits — seul
 * l'affichage change, puisqu'un statut se montre à côté du pseudonyme et non
 * dans la liste des succès.
 *
 * Module pur : `lib/db/achievements.ts` ouvre une connexion au chargement.
 */

export type StatusView = {
  id: string;
  name: string;
  tone: StatusTone;
  icon?: string;
  iconImage?: string;
};

/**
 * Les statuts à afficher, du plus ancien au plus récent.
 *
 * L'ordre chronologique n'est pas cosmétique : « Fondateur » doit rester à
 * gauche quand un « Ambassadeur » s'ajoute des mois plus tard, sinon la ligne
 * de badges se réorganise sous les yeux de gens qui n'ont rien demandé.
 *
 * Le plafond évite qu'un pseudonyme se noie sous les badges — au-delà de trois,
 * plus personne ne les lit.
 */
export function visibleStatuses(
  achievements: readonly AchievementWithUnlockInfo[],
  max = 3
): StatusView[] {
  return achievements
    .filter((achievement) => achievement.isStatus && achievement.unlockedAt)
    .sort((a, b) => (a.unlockedAt!.getTime() ?? 0) - (b.unlockedAt!.getTime() ?? 0))
    .slice(0, max)
    .map((achievement) => ({
      id: achievement.id,
      name: achievement.name,
      tone: isStatusTone(achievement.statusTone ?? "") ? achievement.statusTone! : DEFAULT_STATUS_TONE,
      icon: achievement.icon,
      iconImage: achievement.iconImage,
    }));
}
