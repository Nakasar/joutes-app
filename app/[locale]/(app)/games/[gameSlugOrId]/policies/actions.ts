"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import db from "@/lib/mongodb.ts";
import { PolicyDb, PolicyTranslationInput, PolicyVoteType } from "@/lib/types/policies.ts";
import { ObjectId } from "bson";
import { Policy } from "@/lib/types/policies.ts";
import { Locale } from "@/i18n/config.ts";
import { requirePermission } from "@/lib/db/permissions.ts";
import {
  countAllPolicies,
  createPolicy as createPolicyInDb,
  getAllPolicies,
  voteOnPolicy,
} from "@/lib/db/policies.ts";
import { resolveCardMentions } from "@/lib/game-content-cards.ts";
import { CardNameMatch } from "@/lib/db/cards.ts";
import { mergeTranslationTimestamps } from "@/lib/translations.ts";

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

  await createPolicyInDb({ ...data, createdBy: session.user.id });

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

  await voteOnPolicy(policyId, session.user.id, vote);

  revalidatePath(`/games/${gameSlug}/policies`);
  revalidatePath(`/policies/${policyId}`);
}

