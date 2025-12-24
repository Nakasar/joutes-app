export interface Achievement {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
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

