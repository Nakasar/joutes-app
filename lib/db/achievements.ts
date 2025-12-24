import db from "@/lib/mongodb";
import { Achievement, UserAchievement, AchievementWithUnlockInfo } from "@/lib/types/Achievement";
import { WithId, Document, ObjectId } from "mongodb";

const ACHIEVEMENTS_COLLECTION = "achievements";
const USER_ACHIEVEMENTS_COLLECTION = "user-achievements";

function toAchievement(doc: WithId<Document>): Achievement {
  return {
    id: doc._id.toString(),
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

export async function unlockAchievementById(userId: string, achievementId: string): Promise<boolean> {
  // Vérifier que l'achievement existe
  try {
    const achievement = await db.collection(ACHIEVEMENTS_COLLECTION).findOne({ _id: new ObjectId(achievementId) });
    if (!achievement) {
      console.error(`Achievement not found: ${achievementId}`);
      return false;
    }
  } catch (e) {
    console.error(`Invalid achievement ID: ${achievementId}`);
    return false;
  }

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

  if (result.deletedCount && result.deletedCount > 0) {
    // Cascade delete: remove all user achievement records linked to this achievement
    await db.collection(USER_ACHIEVEMENTS_COLLECTION).deleteMany({ achievementId: id });
    return true;
  }

  return false;
}
