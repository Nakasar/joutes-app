import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "bson";

export type VoteType = "positive" | "negative";

export type VoteTally = {
  positive: number;
  negative: number;
  userVote?: VoteType;
};

/** Collections de votes et champ portant l'identifiant du contenu voté. */
type VoteCollection =
  | { collection: "errata-votes"; field: "errataId" }
  | { collection: "policy-votes"; field: "policyId" };

/**
 * Décompte des votes d'un contenu, additionné côté Mongo plutôt qu'en mémoire :
 * un contenu très voté ne doit pas ramener tous ses votes juste pour les
 * compter. Le vote de l'utilisateur est relu séparément.
 */
export async function tallyVotes(
  target: VoteCollection,
  contentId: ObjectId,
  userId: string,
): Promise<VoteTally> {
  const votes = db.collection<{ userId: ObjectId; vote: VoteType }>(target.collection);
  const contentFilter = { [target.field]: contentId };

  const [groups, own] = await Promise.all([
    votes
      .aggregate<{ _id: VoteType; count: number }>([
        { $match: contentFilter },
        { $group: { _id: "$vote", count: { $sum: 1 } } },
      ])
      .toArray(),
    votes.findOne({ ...contentFilter, userId: new ObjectId(userId) }),
  ]);

  const count = (vote: VoteType) => groups.find((group) => group._id === vote)?.count ?? 0;

  return {
    positive: count("positive"),
    negative: count("negative"),
    userVote: own?.vote,
  };
}
