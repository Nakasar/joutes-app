"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { locales } from "@/i18n/config.ts";
import { auth } from "@/lib/auth.ts";
import { deleteStreamLink, getStreamLink, setStreamLinkTargets } from "@/lib/db/stream-links.ts";
import { canAnnounceOn } from "@/lib/streams/announce.ts";
import { STREAM_PROVIDER_IDS } from "@/lib/streams/identity.ts";
import { syncSubscription, teardownLink } from "@/lib/streams/subscriptions.ts";
import { addTarget, removeTarget } from "@/lib/streams/targets.ts";
import { streamTargetSchema } from "@/lib/schemas/stream-link.schema.ts";
import type { StreamPlatform } from "@/lib/types/StreamLink";

/**
 * Les destinations d'un direct, gérées depuis « Connexions et comptes ».
 *
 * Trois actions seulement : ajouter, retirer, délier. Elles partagent une même
 * discipline — **l'écoute suit les destinations**. Ajouter la première abonne la
 * chaîne chez la plateforme ; retirer la dernière la désabonne et éteint ce qui
 * est affiché. `syncSubscription` porte cette règle et est donc appelée après
 * chaque écriture, sans condition : elle ne fait rien quand il n'y a rien à
 * faire.
 *
 * Les échecs sortent en codes plutôt qu'en phrases : ces actions ne savent pas
 * dans quelle langue la page est rendue.
 */
export type StreamActionError =
  | "UNAUTHENTICATED"
  | "NOT_LINKED"
  | "INVALID"
  | "FORBIDDEN"
  | "ALREADY_ADDED"
  | "TOO_MANY_TARGETS"
  | "FAILED";

export type StreamActionResult = { success: true } | { success: false; error: StreamActionError };

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  return session.user.id;
}

function fail(error: unknown, context: string): StreamActionResult {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { success: false, error: "UNAUTHENTICATED" };
  }

  console.error(context, error);
  return { success: false, error: "FAILED" };
}

function revalidateSecurity() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/account/security`);
  }
}

/** Ajoute un lieu ou un groupe aux endroits où le direct s'annoncera. */
export async function addStreamTarget(platform: StreamPlatform, input: unknown): Promise<StreamActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = streamTargetSchema.safeParse(input);

    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const link = await getStreamLink(userId, platform);

    if (!link) {
      return { success: false, error: "NOT_LINKED" };
    }

    // Le droit se vérifie ici **et** à l'annonce : entre les deux, une propriété
    // peut changer de mains.
    if (!(await canAnnounceOn(userId, parsed.data))) {
      return { success: false, error: "FORBIDDEN" };
    }

    const result = addTarget(link.targets, parsed.data);

    if (!result.ok) {
      return { success: false, error: result.reason };
    }

    const updated = await setStreamLinkTargets(link.id, result.targets);

    if (updated) {
      await syncSubscription(updated);
    }

    revalidateSecurity();
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de l'ajout d'une destination de direct:");
  }
}

/**
 * Retire une destination.
 *
 * Sans contrôle de droit : on retire toujours *sa propre* liaison, et une
 * destination dont on a perdu la propriété est justement celle qu'il faut
 * pouvoir enlever.
 */
export async function removeStreamTarget(platform: StreamPlatform, input: unknown): Promise<StreamActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = streamTargetSchema.safeParse(input);

    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const link = await getStreamLink(userId, platform);

    if (!link) {
      return { success: false, error: "NOT_LINKED" };
    }

    const updated = await setStreamLinkTargets(link.id, removeTarget(link.targets, parsed.data));

    if (updated) {
      await syncSubscription(updated);
    }

    revalidateSecurity();
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors du retrait d'une destination de direct:");
  }
}

/**
 * Délie le compte de la plateforme.
 *
 * L'ordre compte : on éteint le direct affiché et l'écoute **avant** de retirer
 * le compte. L'inverse laisserait une chaîne abonnée chez la plateforme sans
 * plus rien chez nous pour interpréter ses livraisons — et un direct sur une
 * vitrine que personne ne viendrait plus éteindre.
 */
export async function unlinkStreamAccount(platform: StreamPlatform): Promise<StreamActionResult> {
  try {
    const userId = await requireUserId();
    const link = await getStreamLink(userId, platform);

    if (link) {
      await teardownLink(link.id);
      await deleteStreamLink(link.id);
    }

    await auth.api.unlinkAccount({
      body: { providerId: STREAM_PROVIDER_IDS[platform] },
      headers: await headers(),
    });

    revalidateSecurity();
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la déliaison d'un compte de direct:");
  }
}
