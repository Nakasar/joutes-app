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
    iconImage: doc.iconImage,
    points: doc.points || 0,
    category: doc.category,
    isHidden: doc.isHidden || false,
    // Conversion explicite, comme le reste : un champ ajouté au type mais oublié
    // ici serait écrit en base et jamais relu.
    isStatus: doc.isStatus || false,
    statusTone: doc.statusTone,
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

/**
 * Résultat d'un déblocage. Le booléen d'origine confondait « ce succès n'existe
 * pas » et « il l'a déjà », si bien que l'interface ne pouvait qu'afficher les
 * deux à la fois — le message disait littéralement « déjà débloqué ou n'existe
 * pas ». Deux causes, deux réponses.
 */
export type UnlockOutcome = "unlocked" | "already-unlocked" | "not-found";

export async function unlockAchievementById(
  userId: string,
  achievementId: string
): Promise<UnlockOutcome> {
  // Vérifier que l'achievement existe
  try {
    const achievement = await db.collection(ACHIEVEMENTS_COLLECTION).findOne({ _id: new ObjectId(achievementId) });
    if (!achievement) {
      console.error(`Achievement not found: ${achievementId}`);
      return "not-found";
    }
  } catch {
    console.error(`Invalid achievement ID: ${achievementId}`);
    return "not-found";
  }

  const existing = await db.collection(USER_ACHIEVEMENTS_COLLECTION).findOne({
    userId,
    achievementId
  });

  if (existing) {
    return "already-unlocked";
  }

  await db.collection(USER_ACHIEVEMENTS_COLLECTION).insertOne({
    userId,
    achievementId,
    unlockedAt: new Date(),
  });

  return "unlocked";
}

/**
 * Retire un succès à un compte.
 *
 * N'existait pas : jusqu'ici, un succès accordé ne pouvait être retiré qu'en
 * supprimant le succès lui-même, pour tout le monde. Un statut, lui, doit
 * pouvoir se reprendre.
 *
 * ⚠️ `achievementId` est comparé **en tant que chaîne**, sans `new ObjectId(...)`.
 * C'est ainsi que `unlockAchievementById` l'insère, et c'est aussi ce que fait la
 * cascade de `deleteAchievement`. L'envelopper « pour faire propre » ferait
 * silencieusement ne rien supprimer.
 */
export async function revokeAchievementById(userId: string, achievementId: string): Promise<boolean> {
  const result = await db.collection(USER_ACHIEVEMENTS_COLLECTION).deleteOne({
    userId,
    achievementId,
  });

  return result.deletedCount === 1;
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

/**
 * Le classement des succès.
 *
 * Le score se calcule **en mémoire** plutôt que par une jointure : les
 * déblocages portent `achievementId` en chaîne alors que les succès portent un
 * `ObjectId`, si bien qu'un `$lookup` demanderait une conversion à chaque
 * document. Le catalogue tient dans une lecture — c'est déjà l'arbitrage de
 * `lib/db/user-badges.ts` — et le regroupement, lui, se fait bien en base.
 *
 * Les succès cachés comptent : ne pas les afficher n'est pas ne pas les avoir.
 */
export type LeaderboardRow = { userId: string; points: number; unlocked: number };

async function readScores(): Promise<LeaderboardRow[]> {
  const [achievements, rows] = await Promise.all([
    getAllAchievements(),
    db
      .collection(USER_ACHIEVEMENTS_COLLECTION)
      .aggregate<{ _id: string; achievementIds: string[] }>([
        { $group: { _id: "$userId", achievementIds: { $push: "$achievementId" } } },
      ])
      .toArray(),
  ]);

  const points = new Map(achievements.map((achievement) => [achievement.id, achievement.points]));

  return rows
    .map((row) => ({
      userId: row._id,
      unlocked: row.achievementIds.length,
      points: row.achievementIds.reduce((total, id) => total + (points.get(id) ?? 0), 0),
    }))
    // À points égaux, celui qui a débloqué le plus de succès passe devant : il a
    // fait plus de choses, même si elles valaient moins.
    .sort((a, b) => b.points - a.points || b.unlocked - a.unlocked);
}

/**
 * Le classement, restreint aux comptes qu'on accepte d'y voir figurer.
 *
 * L'allowlist est passée plutôt que devinée : ce module ne connaît pas la
 * confidentialité d'un profil, et un classement qui montrerait trois comptes
 * publics tout en annonçant un rang calculé sur tout le monde annoncerait un
 * rang qui ne correspond à aucune place visible.
 *
 * Rend le classement **entier** : le rang d'un compte est son index, et le
 * tronquer ici obligerait à le recalculer ailleurs.
 */
export async function readAchievementsRanking(
  eligibleUserIds: ReadonlySet<string>,
): Promise<LeaderboardRow[]> {
  return (await readScores()).filter((row) => eligibleUserIds.has(row.userId));
}
