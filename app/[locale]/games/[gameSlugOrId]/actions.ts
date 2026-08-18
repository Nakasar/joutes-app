"use server";

import {ErrataDb, ErrataTranslationInput, ErrataType, ErrataVoteType} from "@/lib/types/errata";
import {Locale} from "@/i18n/config";
import {requirePermission} from "@/lib/db/permissions";
import {
  checkErrataCardIds,
  createErrata as createErrataInDb,
  deleteErrataById,
  voteOnErrata,
} from "@/lib/db/erratas";
import {deleteReportsForContent} from "@/lib/db/reports";
import {headers} from "next/headers";
import {auth} from "@/lib/auth";
import {ObjectId} from "mongodb";
import db from "@/lib/mongodb";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/middleware/admin";
import meilisearch, {indexes} from "@/lib/meilisearch";
import {mergeTranslationTimestamps} from "@/lib/translations";

/**
 * Autorise la modification et la suppression d'un errata : son auteur, ou un
 * modérateur (permission `erratas:manage`). Renvoie l'errata pour éviter de le
 * relire ensuite.
 */
async function requireErrataEditRights(errataId: ObjectId) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Utilisateur non authentifié");
  }

  const errata = await db.collection<ErrataDb>("erratas").findOne({ _id: errataId });
  if (!errata) {
    throw new Error("Errata introuvable");
  }

  if (errata.createdBy?.toString() === session.user.id) {
    return errata;
  }

  await requirePermission("erratas:manage");

  return errata;
}

/**
 * Création ouverte à tout utilisateur connecté : les erratas sont un contenu
 * communautaire, arbitré par les votes et les signalements.
 */
export async function createErrata(data: {
  cardIds: string[];
  type: ErrataType;
  details: string;
  originalLang: Locale;
  source?: string;
  errataDate: Date;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("Utilisateur non authentifié");
  }

  const { cardIds } = await createErrataInDb({ ...data, createdBy: session.user.id });

  for (const cardId of cardIds) {
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
    translations?: ErrataTranslationInput[];
  },
  revalidateCardIds?: string[]
) {
  if (!ObjectId.isValid(errataId)) {
    throw new Error("Identifiant d'errata invalide");
  }
  const errataObjId = new ObjectId(errataId);

  const existing = await requireErrataEditRights(errataObjId);

  if (!data.details.trim()) {
    throw new Error("Le contenu de l'errata est requis.");
  }

  const cardIds = data.cardIds ? await checkErrataCardIds(data.cardIds) : undefined;

  const now = new Date();
  let contentUpdatedAt = now;
  if (existing && existing.details === data.details) {
    contentUpdatedAt = existing.contentUpdatedAt ?? existing.createdAt;
  }

  const updateFields: Partial<ErrataDb> = {
    type: data.type,
    details: data.details,
    source: data.source,
    errataDate: data.errataDate,
    contentUpdatedAt,
    translations: data.translations
      ? mergeTranslationTimestamps(existing?.translations, data.translations, (a, b) => a.details === b.details, now)
      : undefined,
  };

  if (cardIds) {
    updateFields.cardIds = cardIds;
  }

  if (data.deprecatedAt !== undefined) {
    if (data.deprecatedAt === null) {
      await db.collection<ErrataDb>("erratas").updateOne(
        { _id: errataObjId },
        { $set: updateFields, $unset: { deprecatedAt: "" } }
      );
    } else {
      updateFields.deprecatedAt = data.deprecatedAt;
      await db.collection<ErrataDb>("erratas").updateOne(
        { _id: errataObjId },
        { $set: updateFields }
      );
    }
  } else {
    await db.collection<ErrataDb>("erratas").updateOne(
      { _id: errataObjId },
      { $set: updateFields }
    );
  }

  revalidatePath("/riftbound/erratas");
  for (const cardId of new Set([...(revalidateCardIds ?? []), ...(cardIds ?? [])])) {
    revalidatePath(`/games/riftbound/cards/${cardId}`);
  }
}

export async function deleteErrata(errataId: string, cardIds?: string[]) {
  if (!ObjectId.isValid(errataId)) {
    throw new Error("Identifiant d'errata invalide");
  }
  const errataObjId = new ObjectId(errataId);

  await requireErrataEditRights(errataObjId);

  await deleteErrataById(errataId);
  // L'errata a disparu : ses éventuels signalements n'ont plus d'objet.
  await deleteReportsForContent({ contentType: "errata", contentId: errataId });

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

  await voteOnErrata(errataId, session.user.id, vote);

  revalidatePath("/riftbound/erratas");
}

export async function setBanStatus(cardId: string, banned: boolean) {
  await requireAdmin();

  const index = meilisearch.index(indexes.riftbound.name);
  await index.updateDocuments([{ id: cardId, banned }]);
  await db.collection("cards").updateOne({ id: cardId }, { $set: { banned } });

  revalidatePath(`/riftbound/cards/${cardId}`);
}