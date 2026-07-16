"use server";

import {ErrataDb, ErrataType, ErrataVoteDb, ErrataVoteType} from "@/lib/types/errata";
import {requirePermission} from "@/lib/db/permissions";
import {headers} from "next/headers";
import {auth} from "@/lib/auth";
import {ObjectId} from "mongodb";
import db from "@/lib/mongodb";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/middleware/admin";
import meilisearch, {indexes} from "@/lib/meilisearch";

export async function createErrata(data: {
  cardIds: string[];
  type: ErrataType;
  details: string;
  source?: string;
  errataDate: Date;
}) {
  await requirePermission("erratas:update");

  if (data.cardIds.length === 0) {
    throw new Error("Un errata doit être lié à au moins une carte.");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Utilisateur non authentifié");
  }

  const errata: ErrataDb = {
    cardIds: data.cardIds,
    type: data.type,
    details: data.details,
    source: data.source,
    errataDate: data.errataDate,
    createdBy: new ObjectId(session.user.id),
    createdAt: new Date(),
  };

  await db.collection<ErrataDb>("erratas").insertOne(errata);

  for (const cardId of data.cardIds) {
    revalidatePath(`/games/riftbound/cards/${cardId}`);
  }
  revalidatePath("/riftbound/erratas");
}

export async function updateErrata(
  errataId: string,
  data: {
    type: ErrataType;
    details: string;
    source?: string;
    errataDate: Date;
    deprecatedAt?: Date | null;
    cardIds?: string[];
  },
  revalidateCardIds?: string[]
) {
  await requirePermission("erratas:update");

  if (data.cardIds && data.cardIds.length === 0) {
    throw new Error("Un errata doit être lié à au moins une carte.");
  }

  const updateFields: Partial<ErrataDb> = {
    type: data.type,
    details: data.details,
    source: data.source,
    errataDate: data.errataDate,
  };

  if (data.cardIds) {
    updateFields.cardIds = data.cardIds;
  }

  if (data.deprecatedAt !== undefined) {
    if (data.deprecatedAt === null) {
      await db.collection<ErrataDb>("erratas").updateOne(
        { _id: new ObjectId(errataId) },
        { $set: updateFields, $unset: { deprecatedAt: "" } }
      );
    } else {
      updateFields.deprecatedAt = data.deprecatedAt;
      await db.collection<ErrataDb>("erratas").updateOne(
        { _id: new ObjectId(errataId) },
        { $set: updateFields }
      );
    }
  } else {
    await db.collection<ErrataDb>("erratas").updateOne(
      { _id: new ObjectId(errataId) },
      { $set: updateFields }
    );
  }

  revalidatePath("/riftbound/erratas");
  for (const cardId of new Set([...(revalidateCardIds ?? []), ...(data.cardIds ?? [])])) {
    revalidatePath(`/games/riftbound/cards/${cardId}`);
  }
}

export async function deleteErrata(errataId: string, cardIds?: string[]) {
  await requirePermission("erratas:update");

  await db.collection<ErrataDb>("erratas").deleteOne({ _id: new ObjectId(errataId) });

  revalidatePath("/riftbound/erratas");
  for (const cardId of cardIds ?? []) {
    revalidatePath(`/games/riftbound/cards/${cardId}`);
  }
}

export async function voteErrata(errataId: string, vote: ErrataVoteType) {
  await requirePermission("erratas:vote");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Utilisateur non authentifié");
  }

  const userId = new ObjectId(session.user.id);
  const errataObjId = new ObjectId(errataId);

  const existing = await db.collection<ErrataVoteDb>("errata-votes").findOne({
    errataId: errataObjId,
    userId,
  });

  if (existing && existing.vote === vote) {
    // Même vote → retrait du vote
    await db.collection<ErrataVoteDb>("errata-votes").deleteOne({
      errataId: errataObjId,
      userId,
    });
  } else {
    // Nouveau vote ou changement de vote → upsert
    await db.collection<ErrataVoteDb>("errata-votes").updateOne(
      { errataId: errataObjId, userId },
      { $set: { vote, createdAt: new Date() } },
      { upsert: true }
    );
  }

  revalidatePath("/riftbound/erratas");
}

export async function setBanStatus(cardId: string, banned: boolean) {
  await requireAdmin();

  const index = meilisearch.index(indexes.riftbound.name);
  await index.updateDocuments([{ id: cardId, banned }]);
  await db.collection("cards").updateOne({ id: cardId }, { $set: { banned } });

  revalidatePath(`/riftbound/cards/${cardId}`);
}