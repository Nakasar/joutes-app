"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";

import { auth } from "@/lib/auth.ts";
import { locales } from "@/i18n/config.ts";
import { canManagePlayGroup, readMemberRole } from "@/lib/play-groups/access.ts";
import { getPlayGroupById } from "@/lib/db/play-groups.ts";
import * as groupsDb from "@/lib/db/play-groups.ts";
import * as sessionsDb from "@/lib/db/play-group-sessions.ts";
import { isSupportedLiveUrl } from "@/lib/media/live-embed.ts";
import {
  playGroupAnnouncementSchema,
  playGroupContentSchema,
  playGroupIdentitySchema,
  playGroupLiveSchema,
  playGroupRsvpSchema,
  playGroupSessionSchema,
  playGroupVisibilitySchema,
} from "@/lib/schemas/play-group.schema.ts";
import type { PlayGroupRsvpAnswer } from "@/lib/types/PlayGroupSession";

/**
 * Les échecs possibles, en codes plutôt qu'en phrases.
 *
 * Ces actions ne savent pas dans quelle langue la page est rendue : elles sont
 * appelées depuis des composants client qui, eux, ont leurs traductions sous la
 * main. Un message écrit ici sortirait en français sur les trois autres langues
 * du catalogue.
 */
export type PlayGroupActionError =
  | "UNAUTHENTICATED"
  | "NOT_MEMBER"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "INVALID_URL"
  | "TOO_MANY_LIVES"
  | "FAILED";

export type PlayGroupActionResult =
  | { success: true }
  | { success: false; error: PlayGroupActionError };

type Viewer = { userId: string; canManage: boolean };

/**
 * La porte commune : membre du groupe, et rôle sous la main.
 *
 * Elle lève plutôt que de renvoyer un résultat, pour que chaque action reste
 * une suite d'appels lisibles ; le `catch` de l'action traduit la levée en
 * code.
 */
async function requireMember(playGroupId: string, manage = false): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    throw new PlayGroupActionFailure("UNAUTHENTICATED");
  }

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    throw new PlayGroupActionFailure("NOT_FOUND");
  }

  const role = readMemberRole(group, userId);
  if (!role) {
    throw new PlayGroupActionFailure("NOT_MEMBER");
  }

  const canManage = canManagePlayGroup(role);
  if (manage && !canManage) {
    throw new PlayGroupActionFailure("FORBIDDEN");
  }

  return { userId, canManage };
}

class PlayGroupActionFailure extends Error {
  constructor(readonly code: PlayGroupActionError) {
    super(code);
    this.name = "PlayGroupActionFailure";
  }
}

function fail(error: unknown, context: string): PlayGroupActionResult {
  if (error instanceof PlayGroupActionFailure) {
    return { success: false, error: error.code };
  }

  console.error(context, error);
  return { success: false, error: "FAILED" };
}

/**
 * Toutes les vues du hub lisent le même groupe : elles se rafraîchissent
 * ensemble.
 *
 * Une invalidation par langue, et non un `/play-groups/…` nu : les pages
 * vivent sous `/[locale]/…`, et un chemin sans langue ne correspond à aucune
 * route rendue — l'invalidation serait silencieusement sans effet. En
 * `layout`, chacune emporte les vues imbriquées du groupe.
 */
function revalidateGroup(playGroupId: string) {
  for (const locale of locales) {
    revalidatePath(`/${locale}/play-groups/${playGroupId}`, "layout");
  }
}

/** Le rôle d'armes, par langue lui aussi — il liste tous les groupes. */
function revalidateRoll() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/play-groups/explore`);
  }
}

// ---------------------------------------------------------------- Sessions

/**
 * Crée une session — confirmée si elle porte une date, sondage si elle porte
 * des créneaux.
 *
 * C'est la même action pour les deux parce que c'est le même objet : un
 * sondage tranché *devient* la session, sans changer d'identité ni perdre les
 * disponibilités déjà exprimées.
 */
export async function createPlayGroupSession(
  playGroupId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    const { userId } = await requireMember(playGroupId);
    const parsed = playGroupSessionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    await sessionsDb.createPlayGroupSession({
      playGroupId,
      title: parsed.data.title,
      gameId: parsed.data.gameId,
      place: parsed.data.place,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      slots: parsed.data.slots,
      pollClosesAt: parsed.data.pollClosesAt,
      createdById: userId,
    });

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la création d'une session de groupe:");
  }
}

/** Bascule la disponibilité du membre sur un créneau du sondage. */
export async function togglePlayGroupSlot(
  playGroupId: string,
  sessionId: string,
  slotId: string,
): Promise<PlayGroupActionResult> {
  try {
    const { userId } = await requireMember(playGroupId);

    const session = await sessionsDb.getPlayGroupSession(sessionId);
    if (!session || session.playGroupId !== playGroupId) {
      return { success: false, error: "NOT_FOUND" };
    }

    const updated = await sessionsDb.togglePlayGroupSlotVote(sessionId, slotId, userId);
    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors du vote sur un créneau:");
  }
}

/** Confirme un créneau : réservé au fondateur et aux admins. */
export async function confirmPlayGroupSlot(
  playGroupId: string,
  sessionId: string,
  slotId: string,
): Promise<PlayGroupActionResult> {
  try {
    await requireMember(playGroupId, true);

    const session = await sessionsDb.getPlayGroupSession(sessionId);
    if (!session || session.playGroupId !== playGroupId) {
      return { success: false, error: "NOT_FOUND" };
    }

    const updated = await sessionsDb.confirmPlayGroupSessionSlot(sessionId, slotId);
    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la confirmation d'un créneau:");
  }
}

/** Pose la présence du membre ; répondre deux fois la même chose l'annule. */
export async function setPlayGroupRsvp(
  playGroupId: string,
  sessionId: string,
  answer: PlayGroupRsvpAnswer,
): Promise<PlayGroupActionResult> {
  try {
    const { userId } = await requireMember(playGroupId);
    const parsed = playGroupRsvpSchema.safeParse({ answer });
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const session = await sessionsDb.getPlayGroupSession(sessionId);
    if (!session || session.playGroupId !== playGroupId) {
      return { success: false, error: "NOT_FOUND" };
    }

    await sessionsDb.setPlayGroupSessionRsvp(sessionId, userId, parsed.data.answer);

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la réponse à une session:");
  }
}

/** Annule une session : son auteur, ou un admin. */
export async function cancelPlayGroupSession(
  playGroupId: string,
  sessionId: string,
): Promise<PlayGroupActionResult> {
  try {
    const { userId, canManage } = await requireMember(playGroupId);

    const session = await sessionsDb.getPlayGroupSession(sessionId);
    if (!session || session.playGroupId !== playGroupId) {
      return { success: false, error: "NOT_FOUND" };
    }

    if (!canManage && session.createdById !== userId) {
      return { success: false, error: "FORBIDDEN" };
    }

    await sessionsDb.updatePlayGroupSession(sessionId, { status: "cancelled" });

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de l'annulation d'une session:");
  }
}

// --------------------------------------------------------------- Annonces

export async function publishPlayGroupAnnouncement(
  playGroupId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    const { userId } = await requireMember(playGroupId, true);
    const parsed = playGroupAnnouncementSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    await groupsDb.addPlayGroupAnnouncement(playGroupId, {
      id: new ObjectId().toString(),
      title: parsed.data.title,
      body: parsed.data.body,
      scope: parsed.data.scope,
      authorId: userId,
      publishedAt: new Date().toISOString(),
    });

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la publication d'une annonce de groupe:");
  }
}

export async function updatePlayGroupAnnouncement(
  playGroupId: string,
  announcementId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    await requireMember(playGroupId, true);
    const parsed = playGroupAnnouncementSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const updated = await groupsDb.updatePlayGroupAnnouncement(playGroupId, announcementId, parsed.data);
    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la mise à jour d'une annonce de groupe:");
  }
}

export async function deletePlayGroupAnnouncement(
  playGroupId: string,
  announcementId: string,
): Promise<PlayGroupActionResult> {
  try {
    await requireMember(playGroupId, true);
    await groupsDb.removePlayGroupAnnouncement(playGroupId, announcementId);

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la suppression d'une annonce de groupe:");
  }
}

// --------------------------------------------------------------- Contenus

/**
 * Publie un contenu.
 *
 * Ouvert à tous les membres, contrairement aux annonces : écrire un compte
 * rendu de tournoi ou déposer sa vidéo n'est pas un acte de gouvernance. La
 * suppression, elle, reste à l'auteur et aux admins.
 */
export async function createPlayGroupContent(
  playGroupId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    const { userId } = await requireMember(playGroupId);
    const parsed = playGroupContentSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    await groupsDb.addPlayGroupContent(playGroupId, {
      id: new ObjectId().toString(),
      ...parsed.data,
      authorId: userId,
      publishedAt: new Date().toISOString(),
    });

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la publication d'un contenu de groupe:");
  }
}

export async function updatePlayGroupContent(
  playGroupId: string,
  contentId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    const { userId, canManage } = await requireMember(playGroupId);
    const parsed = playGroupContentSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const group = await getPlayGroupById(playGroupId);
    const existing = group?.options?.contents?.find((item) => item.id === contentId);
    if (!existing) {
      return { success: false, error: "NOT_FOUND" };
    }

    if (!canManage && existing.authorId !== userId) {
      return { success: false, error: "FORBIDDEN" };
    }

    await groupsDb.updatePlayGroupContent(playGroupId, contentId, parsed.data);

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la mise à jour d'un contenu de groupe:");
  }
}

export async function deletePlayGroupContent(
  playGroupId: string,
  contentId: string,
): Promise<PlayGroupActionResult> {
  try {
    const { userId, canManage } = await requireMember(playGroupId);

    const group = await getPlayGroupById(playGroupId);
    const existing = group?.options?.contents?.find((item) => item.id === contentId);
    if (!existing) {
      return { success: false, error: "NOT_FOUND" };
    }

    if (!canManage && existing.authorId !== userId) {
      return { success: false, error: "FORBIDDEN" };
    }

    await groupsDb.removePlayGroupContent(playGroupId, contentId);

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la suppression d'un contenu de groupe:");
  }
}

// ----------------------------------------------------------------- Direct

/**
 * Déclare son direct.
 *
 * N'importe quel membre déclare le sien — c'est le sien qu'il annonce, et
 * attendre un admin pour cela ferait manquer le direct. Un admin, lui, peut
 * retirer n'importe lequel.
 */
export async function declarePlayGroupLive(
  playGroupId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    const { userId } = await requireMember(playGroupId);
    const parsed = playGroupLiveSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    if (!isSupportedLiveUrl(parsed.data.url)) {
      return { success: false, error: "INVALID_URL" };
    }

    const updated = await groupsDb.setPlayGroupLiveStream(playGroupId, {
      id: new ObjectId().toString(),
      url: parsed.data.url.trim(),
      title: parsed.data.title,
      gameId: parsed.data.gameId,
      memberId: userId,
      startedAt: new Date().toISOString(),
    });

    if (!updated) {
      return { success: false, error: "TOO_MANY_LIVES" };
    }

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la déclaration d'un direct de groupe:");
  }
}

/** Retire un direct : le sien, ou n'importe lequel pour un admin. */
export async function removePlayGroupLive(
  playGroupId: string,
  liveId: string,
): Promise<PlayGroupActionResult> {
  try {
    const { userId, canManage } = await requireMember(playGroupId);

    const group = await getPlayGroupById(playGroupId);
    const live = group?.options?.lives?.find((item) => item.id === liveId);
    if (!live) {
      return { success: false, error: "NOT_FOUND" };
    }

    if (!canManage && live.memberId !== userId) {
      return { success: false, error: "FORBIDDEN" };
    }

    await groupsDb.removePlayGroupLiveStream(playGroupId, liveId);

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors du retrait d'un direct de groupe:");
  }
}

// ------------------------------------------------------- Personnalisation

/** Enregistre l'identité du groupe : nom, description, marque blanche, liens, rythme. */
export async function updatePlayGroupIdentity(
  playGroupId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    await requireMember(playGroupId, true);
    const parsed = playGroupIdentitySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const group = await getPlayGroupById(playGroupId);
    if (!group) {
      return { success: false, error: "NOT_FOUND" };
    }

    await groupsDb.updatePlayGroupProfile(playGroupId, {
      name: parsed.data.name,
      description: parsed.data.description,
    });

    await groupsDb.updatePlayGroupOptions(playGroupId, {
      theme: {
        logo: parsed.data.logo,
        banner: parsed.data.banner,
        // `null` retire l'accent et fait retomber la page sur celui de Joutes ;
        // `undefined` — le champ absent — garde celui déjà enregistré.
        accentColor:
          parsed.data.accentColor === null
            ? undefined
            : (parsed.data.accentColor ?? group.options?.theme?.accentColor),
        tagline: parsed.data.tagline,
      },
      links: parsed.data.links,
      rhythm: {
        label: parsed.data.rhythmLabel,
        defaultPlace: parsed.data.defaultPlace,
      },
    });

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors de la personnalisation d'un groupe:");
  }
}

/**
 * Rendre le groupe public, ou le retirer du rôle d'armes.
 *
 * Réservé au fondateur et aux admins : c'est un réglage de gouvernance, pas une
 * préférence d'affichage. Le rôle d'armes est revalidé en même temps que le
 * groupe — sans quoi un groupe passé en privé y resterait affiché jusqu'à la
 * prochaine écriture.
 */
export async function updatePlayGroupVisibility(
  playGroupId: string,
  input: unknown,
): Promise<PlayGroupActionResult> {
  try {
    await requireMember(playGroupId, true);
    const parsed = playGroupVisibilitySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "INVALID" };
    }

    const updated = await groupsDb.setPlayGroupVisibility(playGroupId, parsed.data.visibility);
    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateGroup(playGroupId);
    revalidateRoll();
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors du changement de visibilité d'un groupe:");
  }
}

// ---------------------------------------------------------------- Vitrine

/** Bascule l'abonnement à la vitrine du groupe. */
export async function togglePlayGroupFollow(playGroupId: string): Promise<PlayGroupActionResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const group = await getPlayGroupById(playGroupId);
    if (!group) {
      return { success: false, error: "NOT_FOUND" };
    }

    await groupsDb.togglePlayGroupFollower(playGroupId, userId);

    revalidateGroup(playGroupId);
    return { success: true };
  } catch (error) {
    return fail(error, "Erreur lors du suivi d'un groupe:");
  }
}
