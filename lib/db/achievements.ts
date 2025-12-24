import db from "@/lib/mongodb";
import { Achievement, UserAchievement, AchievementWithUnlockInfo } from "@/lib/types/Achievement";
import { WithId, Document, ObjectId } from "mongodb";

const ACHIEVEMENTS_COLLECTION = "achievements";
const USER_ACHIEVEMENTS_COLLECTION = "user-achievements";

function toAchievement(doc: WithId<Document>): Achievement {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    icon: doc.icon,
    points: doc.points || 0,
    category: doc.category,
    isHidden: doc.isHidden || false,
  };
}

export async function getAllAchievements(): Promise<Achievement[]> {
  const docs = await db.collection(ACHIEVEMENTS_COLLECTION).find({}).toArray();
  return docs.map(toAchievement);
}

export async function getAchievementById(id: string): Promise<Achievement | null> {
  try {
    const doc = await db.collection(ACHIEVEMENTS_COLLECTION).findOne({ _id: new ObjectId(id) });
    return doc ? toAchievement(doc) : null;
  } catch (e) {
    return null;
  }
}

export async function getUserAchievements(userId: string): Promise<UserAchievement[]> {
  const docs = await db.collection(USER_ACHIEVEMENTS_COLLECTION).find({ userId }).toArray();
  return docs.map(doc => ({
    id: doc._id.toString(),
    userId: doc.userId,
    achievementId: doc.achievementId,
    unlockedAt: doc.unlockedAt,
  }));
}

export async function getAchievementsForUser(userId: string): Promise<AchievementWithUnlockInfo[]> {
  const allAchievements = await getAllAchievements();
  const userAchievements = await getUserAchievements(userId);

  const unlockedMap = new Map<string, Date>();
  userAchievements.forEach(ua => {
    unlockedMap.set(ua.achievementId, ua.unlockedAt);
  });

  return allAchievements.map(achievement => ({
    ...achievement,
    unlockedAt: unlockedMap.get(achievement.id),
  }));
}

export async function unlockAchievement(userId: string, achievementSlug: string): Promise<boolean> {
  const achievement = await db.collection(ACHIEVEMENTS_COLLECTION).findOne({ slug: achievementSlug });
  if (!achievement) {
    console.error(`Achievement not found: ${achievementSlug}`);
    return false;
  }

  const achievementId = achievement._id.toString();

  const existing = await db.collection(USER_ACHIEVEMENTS_COLLECTION).findOne({
    userId,
    achievementId
  });

  if (existing) {
    return false; // Déjà débloqué
  }

  await db.collection(USER_ACHIEVEMENTS_COLLECTION).insertOne({
    userId,
    achievementId,
    unlockedAt: new Date(),
  });

  return true;
}

export async function createAchievement(achievement: Omit<Achievement, "id">): Promise<Achievement> {
  const result = await db.collection(ACHIEVEMENTS_COLLECTION).insertOne(achievement);
  return {
    ...achievement,
    id: result.insertedId.toString(),
  };
}

export async function updateAchievement(id: string, achievement: Partial<Omit<Achievement, "id">>): Promise<boolean> {
  const result = await db.collection(ACHIEVEMENTS_COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: achievement }
  );
  return result.modifiedCount > 0;
}

export async function deleteAchievement(id: string): Promise<boolean> {
  const result = await db.collection(ACHIEVEMENTS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

// Fonction utilitaire pour initialiser les succès (seed)
export async function seedAchievements() {
  const achievements = [
    {
      slug: "first-login",
      name: "Premiers pas",
      description: "Connectez-vous pour la première fois.",
      icon: "👋",
      points: 10,
      category: "Général"
    },
    {
      slug: "profile-complete",
      name: "Identité affirmée",
      description: "Complétez votre profil (avatar, description).",
      icon: "📝",
      points: 20,
      category: "Général"
    },
    {
      slug: "first-game",
      name: "Dans l'arène",
      description: "Participez à votre premier match.",
      icon: "⚔️",
      points: 50,
      category: "Jeu"
    }
  ];

  for (const achievement of achievements) {
    await db.collection(ACHIEVEMENTS_COLLECTION).updateOne(
      { slug: achievement.slug },
      { $set: achievement },
      { upsert: true }
    );
  }
}
