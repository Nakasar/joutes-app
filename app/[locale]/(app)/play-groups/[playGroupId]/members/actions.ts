"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";

import db from "@/lib/mongodb.ts";
import { auth } from "@/lib/auth.ts";
import { locales } from "@/i18n/config.ts";
import { canManagePlayGroup, readMemberRole } from "@/lib/play-groups/access.ts";
import {
  cancelPlayGroupInvitation,
  getPendingInvitationsForPlayGroup,
  getPlayGroupById,
} from "@/lib/db/play-groups.ts";

export type PlayGroupInvitationResult = { success: true } | { success: false; error: "FORBIDDEN" | "NOT_FOUND" | "FAILED" };

/** Fondateur ou admin du groupe, et le groupe avec. */
async function requireManager(playGroupId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return null;
  }

  return canManagePlayGroup(readMemberRole(group, userId)) ? { group, session } : null;
}

/** Retire une invitation en attente. */
export async function cancelPlayGroupInvitationAction(
  playGroupId: string,
  invitationId: string,
): Promise<PlayGroupInvitationResult> {
  try {
    const manager = await requireManager(playGroupId);
    if (!manager) {
      return { success: false, error: "FORBIDDEN" };
    }

    const cancelled = await cancelPlayGroupInvitation(invitationId, playGroupId);
    if (!cancelled) {
      return { success: false, error: "NOT_FOUND" };
    }

    for (const locale of locales) {
      revalidatePath(`/${locale}/play-groups/${playGroupId}/members`);
    }
    return { success: true };
  } catch (error) {
    console.error("Erreur lors de l'annulation d'une invitation de groupe:", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Relance une invitation : une notification de plus, la même invitation.
 *
 * Rien n'est recréé — l'invitation en attente reste la même, avec sa date
 * d'origine. Relancer, c'est rappeler, pas réinviter.
 */
export async function resendPlayGroupInvitationAction(
  playGroupId: string,
  invitationId: string,
): Promise<PlayGroupInvitationResult> {
  try {
    const manager = await requireManager(playGroupId);
    if (!manager) {
      return { success: false, error: "FORBIDDEN" };
    }

    const invitation = (await getPendingInvitationsForPlayGroup(playGroupId)).find(
      (item) => item.id === invitationId,
    );
    if (!invitation) {
      return { success: false, error: "NOT_FOUND" };
    }

    const { group, session } = manager;
    const now = new Date().toISOString();

    await db.collection("notifications").insertOne({
      _id: new ObjectId(),
      id: new ObjectId().toString(),
      type: "user",
      userId: invitation.invitedUserId,
      title: "Invitation à un groupe de jeu",
      description: `${session.user.name || session.user.email || "Quelqu'un"} vous a invité à rejoindre ${group.name}`,
      createdAt: now,
      playGroupId: group.id,
      playGroupName: group.name,
      target: "user",
    });

    for (const locale of locales) {
      revalidatePath(`/${locale}/play-groups/${playGroupId}/members`);
    }
    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la relance d'une invitation de groupe:", error);
    return { success: false, error: "FAILED" };
  }
}
