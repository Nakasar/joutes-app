"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import {
  areUsersFriends,
  createFriendRequest,
  DuplicateFriendRequestError,
  getPendingRequestBetween,
} from "@/lib/db/friends.ts";
import { getUserById, updateUserShowcase } from "@/lib/db/users.ts";
import { isFollowingUser, toggleUserFollower } from "@/lib/db/user-followers.ts";
import { notifyUser } from "@/lib/services/notifications.ts";

/**
 * Ce qu'on fait depuis la vitrine de quelqu'un d'autre.
 *
 * Les échecs sortent en **codes** plutôt qu'en phrases : ces actions ne savent
 * pas dans quelle langue la page est rendue, et c'est le composant qui les
 * traduit — la convention de `account/security/stream-actions.ts`.
 *
 * **La revalidation vise le motif de route** et non une adresse : on arrive
 * presque toujours sur un profil par son pseudonyme, jamais par son
 * identifiant, et `revalidatePath('/users/' + userId)` n'invaliderait donc
 * jamais la page que les gens regardent.
 */

export type ProfileActionError =
  | "UNAUTHENTICATED"
  | "SELF"
  | "NOT_FOUND"
  | "ALREADY"
  | "FAILED";

export type ProfileActionResult = { success: true } | { success: false; error: ProfileActionError };

function revalidateProfiles() {
  revalidatePath("/users/[userTagOrId]", "page");
  revalidatePath("/users", "page");
}

async function requireViewer(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/**
 * S'abonner à un profil, ou s'en désabonner.
 *
 * À sens unique et sans demande : on suit une vitrine comme on suit un lieu.
 * Le lien d'ami, lui, se demande — c'est l'action d'à côté, et les deux
 * cohabitent parce qu'elles ne disent pas la même chose.
 */
export async function toggleFollowUserAction(
  userId: string,
): Promise<{ success: true; following: boolean } | { success: false; error: ProfileActionError }> {
  try {
    const viewerId = await requireViewer();
    if (!viewerId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    if (viewerId === userId) {
      return { success: false, error: "SELF" };
    }

    const target = await getUserById(userId);
    if (!target) {
      return { success: false, error: "NOT_FOUND" };
    }

    const following = await toggleUserFollower(userId, viewerId);
    revalidateProfiles();

    return { success: true, following };
  } catch (error) {
    console.error("Abonnement impossible", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Demander à devenir ami.
 *
 * Le geste existe déjà ailleurs (`app/api/friends`) ; il est repris ici parce
 * qu'un profil est justement l'endroit où l'on décide de quelqu'un, et qu'y
 * renvoyer vers un autre écran pour cela n'aurait pas de sens. Les mêmes
 * refus, la même notification.
 */
export async function requestFriendshipAction(userId: string): Promise<ProfileActionResult> {
  try {
    const viewerId = await requireViewer();
    if (!viewerId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    if (viewerId === userId) {
      return { success: false, error: "SELF" };
    }

    const [target, requester, alreadyFriends, pending] = await Promise.all([
      getUserById(userId),
      getUserById(viewerId),
      areUsersFriends(viewerId, userId),
      getPendingRequestBetween(viewerId, userId),
    ]);

    if (!target) {
      return { success: false, error: "NOT_FOUND" };
    }

    if (alreadyFriends || pending) {
      return { success: false, error: "ALREADY" };
    }

    try {
      await createFriendRequest({ requesterId: viewerId, recipientId: userId });
    } catch (error) {
      // L'index unique attrape la course que la lecture ci-dessus ne peut pas :
      // deux clics rapides, deux demandes.
      if (error instanceof DuplicateFriendRequestError) {
        return { success: false, error: "ALREADY" };
      }
      throw error;
    }

    await notifyUser(
      userId,
      "Nouvelle demande d'ami",
      `${requester?.displayName || requester?.username || "Quelqu'un"} souhaite devenir votre ami`,
    );

    revalidateProfiles();
    return { success: true };
  } catch (error) {
    console.error("Demande d'ami impossible", error);
    return { success: false, error: "FAILED" };
  }
}

/**
 * Épingler un deck sur sa propre vitrine, ou le désépingler.
 *
 * Un seul à la fois : c'est ce qu'« épinglé » veut dire. `null` désépingle, ce
 * que le même clic sur le deck déjà épinglé envoie.
 *
 * La propriété du deck est vérifiée **et** sa visibilité : épingler un deck
 * privé mettrait en avant, sur une page publique, quelque chose que son auteur
 * a rangé.
 */
export async function setPinnedDeckAction(deckId: string | null): Promise<ProfileActionResult> {
  try {
    const viewerId = await requireViewer();
    if (!viewerId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    if (deckId !== null) {
      const { decks } = await searchDecks({
        playerId: viewerId,
        visibility: "public",
        limit: 100,
      });

      if (!decks.some((deck) => deck.id === deckId)) {
        return { success: false, error: "NOT_FOUND" };
      }
    }

    const updated = await updateUserShowcase(viewerId, {
      pinnedDeckId: deckId ?? undefined,
    });

    if (!updated) {
      return { success: false, error: "NOT_FOUND" };
    }

    revalidateProfiles();
    return { success: true };
  } catch (error) {
    console.error("Épinglage impossible", error);
    return { success: false, error: "FAILED" };
  }
}

/** L'état d'abonnement, pour une bascule optimiste qui se recale. */
export async function readFollowStateAction(
  userId: string,
): Promise<{ following: boolean } | null> {
  const viewerId = await requireViewer();
  if (!viewerId) {
    return null;
  }

  return { following: await isFollowingUser(userId, viewerId) };
}
