import 'server-only';

import db from "@/lib/mongodb";
import { Policy, PolicyDb } from "@/lib/types/policies";
import { ObjectId } from "bson";

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
    .aggregate(pipeline)
    .toArray();

  return policiesDb.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    content: p.content,
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