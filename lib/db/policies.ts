import 'server-only';

import db from "@/lib/mongodb";
import { Policy, PolicyDb, PolicyVoteDb, PolicyVoteType } from "@/lib/types/policies";
import { Locale } from "@/i18n/config";
import { tallyVotes } from "@/lib/db/votes";
import { ObjectId } from "bson";

// Shape of an aggregation pipeline result that joins in votes and the game,
// as opposed to a plain `PolicyDb` document straight from the collection.
type PolicyAggregateResult = PolicyDb & {
  _id: ObjectId;
  votesList?: PolicyVoteDb[];
  gameArr?: { _id: ObjectId; slug?: string; name: string };
};

function buildPolicyMatchFilter({
                                  gameId,
                                  search,
                                }: {
  gameId: string;
  search?: string;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    gameId: new ObjectId(gameId),
  };

  if (search?.trim()) {
    filter.$text = { $search: search.trim() };
  }

  return filter;
}

export async function countAllPolicies({
                                         gameId,
                                         search,
                                       }: {
  gameId: string;
  search?: string;
}): Promise<number> {
  const filter = buildPolicyMatchFilter({ gameId, search });
  return db.collection<PolicyDb>("policies").countDocuments(filter);
}

export async function getAllPolicies({
                                       gameId,
                                       offset = 0,
                                       limit = 20,
                                       userId,
                                       search,
                                       sortOrder = "asc",
                                     }: {
  gameId: string;
  offset?: number;
  limit?: number;
  userId?: string;
  search?: string;
  sortOrder?: "asc" | "desc";
}): Promise<Policy[]> {
  const matchFilter = buildPolicyMatchFilter({ gameId, search });
  const sortDir = sortOrder === "asc" ? 1 : -1;

  // When a text search is active, sort by relevance score first
  const sortStage: Record<string, unknown> = search?.trim()
    ? { score: { $meta: "textScore" }, title: sortDir }
    : { title: sortDir, createdAt: -1 };

  const pipeline: object[] = [
    { $match: matchFilter },
    { $sort: sortStage },
    { $skip: offset },
    { $limit: limit },
    {
      $lookup: {
        from: "policy-votes",
        localField: "_id",
        foreignField: "policyId",
        as: "votesList",
      },
    },
    {
      $lookup: {
        from: "games",
        localField: "gameId",
        foreignField: "_id",
        as: "gameArr",
        pipeline: [
          { $limit: 1 },
          { $project: { _id: 1, slug: 1, name: 1 } },
        ],
      },
    },
    {
      $unwind: {
        path: "$gameArr",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  const policiesDb = await db
    .collection<PolicyDb>("policies")
    .aggregate<PolicyAggregateResult>(pipeline)
    .toArray();

  return policiesDb.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    content: p.content,
    originalLang: p.originalLang ?? "fr",
    contentUpdatedAt: p.contentUpdatedAt ?? p.createdAt,
    translations: p.translations,
    gameId: p.gameId.toString(),
    game: p.gameArr
      ? { id: p.gameArr._id.toString(), slug: p.gameArr.slug, name: p.gameArr.name }
      : undefined,
    source: p.source,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    deprecatedAt: p.deprecatedAt,
    votes: {
      positive: (p.votesList ?? []).filter((v: { vote: string }) => v.vote === "positive").length,
      negative: (p.votesList ?? []).filter((v: { vote: string }) => v.vote === "negative").length,
      userVote: userId
        ? (p.votesList ?? []).find(
          (v: { userId: ObjectId; vote: string }) => v.userId.toString() === userId
        )?.vote
        : undefined,
    },
  }));
}

export async function getPolicyById(id: string, userId?: string, gameId?: string): Promise<Policy | null> {
  if (!ObjectId.isValid(id)) return null;

  const matchFilter: Record<string, unknown> = { _id: new ObjectId(id) };
  if (gameId) {
    matchFilter.gameId = new ObjectId(gameId);
  }

  const pipeline: object[] = [
    { $match: matchFilter },
    {
      $lookup: {
        from: "policy-votes",
        localField: "_id",
        foreignField: "policyId",
        as: "votesList",
      },
    },
    {
      $lookup: {
        from: "games",
        localField: "gameId",
        foreignField: "_id",
        as: "gameArr",
        pipeline: [
          { $limit: 1 },
          { $project: { _id: 1, slug: 1, name: 1 } },
        ],
      },
    },
    {
      $unwind: {
        path: "$gameArr",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  const [p] = await db.collection<PolicyDb>("policies").aggregate<PolicyAggregateResult>(pipeline).toArray();
  if (!p) return null;

  return {
    id: p._id.toString(),
    title: p.title,
    content: p.content,
    originalLang: p.originalLang ?? "fr",
    contentUpdatedAt: p.contentUpdatedAt ?? p.createdAt,
    translations: p.translations,
    gameId: p.gameId.toString(),
    game: p.gameArr
      ? { id: p.gameArr._id.toString(), slug: p.gameArr.slug, name: p.gameArr.name }
      : undefined,
    source: p.source,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    deprecatedAt: p.deprecatedAt,
    votes: {
      positive: (p.votesList ?? []).filter((v: { vote: string }) => v.vote === "positive").length,
      negative: (p.votesList ?? []).filter((v: { vote: string }) => v.vote === "negative").length,
      userVote: userId
        ? (p.votesList ?? []).find(
          (v: { userId: ObjectId; vote: string }) => v.userId.toString() === userId
        )?.vote
        : undefined,
    },
  };
}
/**
 * Insère une politique pour un jeu. Renvoie son identifiant ; l'appelant se
 * charge de revalider les pages concernées.
 */
export async function createPolicy(data: {
  gameId: string;
  title: string;
  content: string;
  originalLang: Locale;
  source?: string;
  createdBy: string;
}): Promise<string> {
  const now = new Date();
  const policy: PolicyDb = {
    gameId: new ObjectId(data.gameId),
    title: data.title,
    content: data.content,
    originalLang: data.originalLang,
    contentUpdatedAt: now,
    source: data.source,
    createdBy: data.createdBy,
    createdAt: now,
  };

  const result = await db.collection<PolicyDb>("policies").insertOne(policy);

  return result.insertedId.toString();
}

/**
 * Pose, change ou retire le vote d'un utilisateur sur une politique — revoter à
 * l'identique retire le vote. Renvoie le décompte à jour, ou `null` si la
 * politique n'existe pas.
 */
export async function voteOnPolicy(
  policyId: string,
  userId: string,
  vote: PolicyVoteType,
): Promise<Policy["votes"] | null> {
  if (!ObjectId.isValid(policyId)) {
    return null;
  }

  const policyObjId = new ObjectId(policyId);
  const policy = await db.collection<PolicyDb>("policies").findOne({ _id: policyObjId });
  if (!policy) {
    return null;
  }

  const userObjId = new ObjectId(userId);
  const votes = db.collection<PolicyVoteDb>("policy-votes");
  const existing = await votes.findOne({ policyId: policyObjId, userId: userObjId });

  if (existing && existing.vote === vote) {
    await votes.deleteOne({ policyId: policyObjId, userId: userObjId });
  } else {
    await votes.updateOne(
      { policyId: policyObjId, userId: userObjId },
      { $set: { vote, createdAt: new Date() } },
      { upsert: true },
    );
  }

  return tallyVotes({ collection: "policy-votes", field: "policyId" }, policyObjId, userId);
}

/**
 * Suppression d'une policy et de ses votes (modération).
 */
export async function deletePolicyById(policyId: string): Promise<boolean> {
  if (!ObjectId.isValid(policyId)) {
    return false;
  }

  const _id = new ObjectId(policyId);
  const result = await db.collection<PolicyDb>("policies").deleteOne({ _id });
  if (result.deletedCount === 0) {
    return false;
  }

  await db.collection("policy-votes").deleteMany({ policyId: _id });
  return true;
}
