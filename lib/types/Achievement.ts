import type { StatusTone } from "@/lib/achievements/status-tone";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  // Emoji héritée : conservée pour les anciens succès (repli d'affichage).
  icon?: string;
  // URL d'une image carrée importée, prioritaire sur l'emoji à l'affichage.
  iconImage?: string;
  points: number;
  category?: string;
  isHidden?: boolean;
  /**
   * Affiché en badge à côté du pseudonyme, et non seulement dans la liste des
   * succès. C'est ce qui distingue un statut — « Fondateur », « Modérateur » —
   * d'un succès ordinaire. Un statut n'ouvre aucun droit : c'est de la
   * reconnaissance, pas de l'accès.
   */
  isStatus?: boolean;
  /** Teinte du badge, parmi `lib/achievements/status-tone.ts`. */
  statusTone?: StatusTone;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  unlockedAt: Date;
}

export interface AchievementWithUnlockInfo extends Achievement {
  unlockedAt?: Date;
}

