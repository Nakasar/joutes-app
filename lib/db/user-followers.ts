import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/**
 * Les abonnements d'un profil à un autre.
 *
 * **Une collection dédiée, et non un tableau sur le compte.** Deux raisons, les
 * mêmes qui ont mené les groupes de jeu au même choix : le document `user` est
 * aussi écrit par better-auth, et un tableau d'abonnés y croîtrait sans borne ;
 * et le registre a besoin de compter les abonnés de vingt comptes d'un coup, ce
 * qu'un `$group` fait en une requête là où vingt lectures de documents en
 * feraient vingt.
 *
 * **À sens unique, et distinct des amis.** S'abonner ne demande rien à
 * personne : on suit une vitrine comme on suit un lieu. Le lien d'ami, lui,
 * reste bilatéral et passe par une demande (`lib/db/friends.ts`) — les deux
 * cohabitent sur le profil parce qu'ils ne disent pas la même chose.
 */

const COLLECTION_NAME = "userFollowers";

type UserFollowerDocument = {
  _id: ObjectId;
  /** Le compte suivi. */
  userId: string;
  /** Celui qui suit. */
  followerId: string;
  createdAt: string;
};

const userFollowersCollection = db.collection<UserFollowerDocument>(COLLECTION_NAME);

/**
 * Bascule l'abonnement, et rend l'état obtenu.
 *
 * On ne s'abonne pas à soi-même : l'appelant s'en garde, mais la base aussi,
 * parce qu'un compteur d'abonnés qui se compte lui-même serait faux partout.
 */
export async function toggleUserFollower(userId: string, followerId: string): Promise<boolean> {
  if (userId === followerId) {
    return false;
  }

  const deleted = await userFollowersCollection.deleteOne({ userId, followerId });
  if (deleted.deletedCount > 0) {
    return false;
  }

  await userFollowersCollection.insertOne({
    _id: new ObjectId(),
    userId,
    followerId,
    createdAt: new Date().toISOString(),
  });

  return true;
}

export async function isFollowingUser(userId: string, followerId: string): Promise<boolean> {
  const follower = await userFollowersCollection.findOne({ userId, followerId });
  return !!follower;
}

export async function countUserFollowers(userId: string): Promise<number> {
  return userFollowersCollection.countDocuments({ userId });
}

/**
 * Les abonnés de plusieurs comptes, en une requête.
 *
 * Le pendant en gros de `countUserFollowers` : une fiche de registre affiche ce
 * chiffre, et une requête par ligne ne se défend pas.
 */
export async function countFollowersByUser(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await userFollowersCollection
    .aggregate<{ _id: string; count: number }>([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ])
    .toArray();

  return new Map(rows.map((row) => [row._id, row.count]));
}

/**
 * Les comptes qu'un lecteur suit déjà.
 *
 * Le registre doit savoir, pour chaque fiche, si le bouton dit « Suivre » ou
 * « Suivi » — et une requête par fiche pour un booléen ne se défend pas plus
 * ici qu'ailleurs.
 */
export async function readFollowedUserIds(followerId: string): Promise<Set<string>> {
  const rows = await userFollowersCollection
    .find({ followerId }, { projection: { userId: 1 } })
    .toArray();

  return new Set(rows.map((row) => row.userId));
}

/**
 * Les comptes les plus suivis, du plus au moins.
 *
 * Le tri par abonnés ne peut pas se faire depuis la collection `user` : le
 * chiffre n'y est pas. On l'inverse donc — on classe ici, on va chercher les
 * comptes ensuite.
 */
export async function readMostFollowedUserIds(limit: number): Promise<string[]> {
  const rows = await userFollowersCollection
    .aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$userId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: Math.max(1, Math.min(limit, 200)) },
    ])
    .toArray();

  return rows.map((row) => row._id);
}

/** Efface les abonnements d'un compte supprimé, dans les deux sens. */
export async function purgeUserFollows(userId: string): Promise<number> {
  const result = await userFollowersCollection.deleteMany({
    $or: [{ userId }, { followerId: userId }],
  });

  return result.deletedCount;
}

export async function createUserFollowerIndexes(): Promise<void> {
  // Unique : deux clics rapides sur « Suivre » ne doivent pas compter deux fois.
  await userFollowersCollection.createIndex({ userId: 1, followerId: 1 }, { unique: true });
  await userFollowersCollection.createIndex({ followerId: 1 });
}
