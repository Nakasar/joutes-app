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

