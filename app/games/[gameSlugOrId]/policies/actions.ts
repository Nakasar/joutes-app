"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/mongodb";
import { PolicyDb, PolicyTranslation, PolicyVoteDb, PolicyVoteType } from "@/lib/types/policies";
import { ObjectId } from "bson";
import { Policy } from "@/lib/types/policies";
import { Locale } from "@/i18n/config";
import { requirePermission } from "@/lib/db/permissions";
import { getAllPolicies, countAllPolicies } from "@/lib/db/policies";
import { resolveCardMentions } from "@/lib/game-content-cards";
import { CardNameMatch } from "@/lib/db/cards";

export async function searchPolicies({
  gameId,
  search,
  sortOrder = "asc",
  page = 1,
  pageSize = 20,
}: {
  gameId: string;
  search?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}): Promise<{
  policies: Policy[];
  totalCount: number;
  cardIdByName: Record<string, string>;
  cardsById: Record<string, CardNameMatch>;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  const offset = (page - 1) * pageSize;

  const [policies, totalCount] = await Promise.all([
    getAllPolicies({ gameId, offset, limit: pageSize, userId, search, sortOrder }),
    countAllPolicies({ gameId, search }),
  ]);

  const { cardIdByName, cardsById } = await resolveCardMentions(
    new ObjectId(gameId),
    policies.map((p) => p.content)
  );

  return { policies, totalCount, cardIdByName, cardsById };
}

export async function createPolicy(data: {
  gameId: string;
  title: string;
  content: string;
  originalLang: Locale;
  source?: string;
}) {
  await requirePermission("policies:update");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Utilisateur non authentifié");
  }

  const game = await db.collection("games").findOne({ _id: new ObjectId(data.gameId) });
  const gameSlug = game?.slug ?? data.gameId;

  const policy: PolicyDb = {
    gameId: new ObjectId(data.gameId),
    title: data.title,
    content: data.content,
    originalLang: data.originalLang,
    source: data.source,
    createdBy: session.user.id,
    createdAt: new Date(),
  };

  await db.collection<PolicyDb>("policies").insertOne(policy);

  revalidatePath(`/games/${gameSlug}/policies`);
}

export async function updatePolicy(
  policyId: string,
  gameSlug: string,
  data: {
    title: string;
    content: string;
    source?: string;
    deprecatedAt?: Date | null;
    translations?: PolicyTranslation[];
  }
) {
  await requirePermission("policies:update");

  const updateFields: Partial<PolicyDb> = {
    title: data.title,
    content: data.content,
    source: data.source,
    translations: data.translations,
  };

  if (data.deprecatedAt !== undefined) {
    if (data.deprecatedAt === null) {
      await db.collection<PolicyDb>("policies").updateOne(
        { _id: new ObjectId(policyId) },
        { $set: updateFields, $unset: { deprecatedAt: "" } }
      );
    } else {
      updateFields.deprecatedAt = data.deprecatedAt;
      await db.collection<PolicyDb>("policies").updateOne(
        { _id: new ObjectId(policyId) },
        { $set: updateFields }
      );
    }
  } else {
    await db.collection<PolicyDb>("policies").updateOne(
      { _id: new ObjectId(policyId) },
      { $set: updateFields }
    );
  }

  revalidatePath(`/games/${gameSlug}/policies`);
  revalidatePath(`/policies/${policyId}`);
}

export async function deletePolicy(policyId: string, gameSlug: string) {
  await requirePermission("policies:update");

  await db
    .collection<PolicyDb>("policies")
    .deleteOne({ _id: new ObjectId(policyId) });

  revalidatePath(`/games/${gameSlug}/policies`);
  revalidatePath(`/policies/${policyId}`);
}

export async function votePolicy(policyId: string, gameSlug: string, vote: PolicyVoteType) {
  await requirePermission("policies:vote");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Utilisateur non authentifié");
  }

  const userId = new ObjectId(session.user.id);
  const policyObjId = new ObjectId(policyId);

  const existing = await db.collection<PolicyVoteDb>("policy-votes").findOne({
    policyId: policyObjId,
    userId,
  });

  if (existing && existing.vote === vote) {
    // Même vote → retrait du vote
    await db.collection<PolicyVoteDb>("policy-votes").deleteOne({
      policyId: policyObjId,
      userId,
    });
  } else {
    // Nouveau vote ou changement de vote → upsert
    await db.collection<PolicyVoteDb>("policy-votes").updateOne(
      { policyId: policyObjId, userId },
      { $set: { vote, createdAt: new Date() } },
      { upsert: true }
    );
  }

  revalidatePath(`/games/${gameSlug}/policies`);
  revalidatePath(`/policies/${policyId}`);
}

