"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/mongodb";
import { PolicyDb, PolicyTranslationInput, PolicyVoteDb, PolicyVoteType } from "@/lib/types/policies";
import { ObjectId } from "bson";
import { Policy } from "@/lib/types/policies";
import { Locale } from "@/i18n/config";
import { requirePermission } from "@/lib/db/permissions";
import { getAllPolicies, countAllPolicies } from "@/lib/db/policies";
import { resolveCardMentions } from "@/lib/game-content-cards";
import { CardNameMatch } from "@/lib/db/cards";
import { mergeTranslationTimestamps } from "@/lib/translations";

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
    policies.flatMap((p) => [p.content, ...(p.translations ?? []).map((tr) => tr.content)])
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

  const now = new Date();
  const policy: PolicyDb = {
    gameId: new ObjectId(data.gameId),
    title: data.title,
    content: data.content,
    originalLang: data.originalLang,
    contentUpdatedAt: now,
    source: data.source,
    createdBy: session.user.id,
    createdAt: now,
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
    translations?: PolicyTranslationInput[];
  }
) {
  await requirePermission("policies:update");

  if (!ObjectId.isValid(policyId)) {
    throw new Error("Identifiant de policy invalide");
  }
  const policyObjId = new ObjectId(policyId);

  const existing = await db.collection<PolicyDb>("policies").findOne({ _id: policyObjId });
  const now = new Date();
  let contentUpdatedAt = now;
  if (existing && existing.title === data.title && existing.content === data.content) {
    contentUpdatedAt = existing.contentUpdatedAt ?? existing.createdAt;
  }

  const updateFields: Partial<PolicyDb> = {
    title: data.title,
    content: data.content,
    source: data.source,
    contentUpdatedAt,
    translations: data.translations
      ? mergeTranslationTimestamps(
          existing?.translations,
          data.translations,
          (a, b) => a.title === b.title && a.content === b.content,
          now
        )
      : undefined,
  };

  if (data.deprecatedAt !== undefined) {
    if (data.deprecatedAt === null) {
      await db.collection<PolicyDb>("policies").updateOne(
        { _id: policyObjId },
        { $set: updateFields, $unset: { deprecatedAt: "" } }
      );
    } else {
      updateFields.deprecatedAt = data.deprecatedAt;
      await db.collection<PolicyDb>("policies").updateOne(
        { _id: policyObjId },
        { $set: updateFields }
      );
    }
  } else {
    await db.collection<PolicyDb>("policies").updateOne(
      { _id: policyObjId },
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

