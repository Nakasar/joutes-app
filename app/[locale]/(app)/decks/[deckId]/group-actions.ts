"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { getDeckSummariesByIds } from "@/lib/db/decks.ts";
import { listPlayGroupIdsForDeck } from "@/lib/db/play-group-decks.ts";
import { getPlayGroupById, getPlayGroupsForUser, isGameEnabledForPlayGroup } from "@/lib/db/play-groups.ts";
import { readMemberRole } from "@/lib/play-groups/access.ts";
import { addDecksToGroup, removeDeckFromGroup } from "@/lib/play-groups/deck-library.ts";
import { refuseGroupDeckAdd, type GroupDeckRefusal } from "@/lib/play-groups/decks.ts";

import { revalidateGroupDecks } from "../../play-groups/[playGroupId]/decks/revalidate.ts";

/**
 * « Partager à un groupe », depuis la fiche de mon deck : le pendant de la
 * fenêtre « Ajouter mes decks » du groupe, avec les mêmes règles
 * (`lib/play-groups/decks.ts`).
 */

type Failure = { success: false; error: "UNAUTHENTICATED" | "NOT_FOUND" | "FORBIDDEN" | "FAILED" };

export type MyGroupForDeck = {
  id: string;
  name: string;
  shared: boolean;
  /** Pourquoi ce deck ne peut pas entrer dans ce groupe, s'il ne le peut pas. */
  refusal?: GroupDeckRefusal;
};

async function readUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/** Mes groupes, et pour chacun : le deck y est-il, et peut-il y entrer. */
export async function listMyGroupsForDeck(
  deckId: string,
): Promise<{ success: true; groups: MyGroupForDeck[] } | Failure> {
  try {
    const userId = await readUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const [[deck], groups, sharedIn] = await Promise.all([
      getDeckSummariesByIds([deckId]),
      getPlayGroupsForUser(userId),
      listPlayGroupIdsForDeck(deckId),
    ]);
    if (!deck) {
      return { success: false, error: "NOT_FOUND" };
    }
    if (deck.playerId !== userId) {
      return { success: false, error: "FORBIDDEN" };
    }

    const shared = new Set(sharedIn);

    return {
      success: true,
      groups: groups.map((group) => {
        const refusal = refuseGroupDeckAdd({
          deck,
          userId,
          role: readMemberRole(group, userId),
          isGameEnabled: isGameEnabledForPlayGroup(group, deck.gameId),
        });

        return { id: group.id, name: group.name, shared: shared.has(group.id), refusal: refusal ?? undefined };
      }),
    };
  } catch (error) {
    console.error("listMyGroupsForDeck", error);
    return { success: false, error: "FAILED" };
  }
}

/** Met mon deck dans un groupe, ou l'en retire. */
export async function setDeckInGroupAction(
  deckId: string,
  playGroupId: string,
  shared: boolean,
): Promise<{ success: true } | Failure> {
  try {
    const userId = await readUserId();
    if (!userId) {
      return { success: false, error: "UNAUTHENTICATED" };
    }

    const group = await getPlayGroupById(playGroupId);
    if (!group) {
      return { success: false, error: "NOT_FOUND" };
    }
    const viewer = { userId, role: readMemberRole(group, userId) };

    if (shared) {
      const outcome = await addDecksToGroup(group, viewer, [deckId]);
      if (outcome.refused.length > 0) {
        return { success: false, error: outcome.refused[0].reason === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN" };
      }
    } else {
      const change = await removeDeckFromGroup(playGroupId, viewer, deckId);
      if (change !== "OK") {
        return { success: false, error: change };
      }
    }

    revalidateGroupDecks([playGroupId], deckId);
    return { success: true };
  } catch (error) {
    console.error("setDeckInGroupAction", error);
    return { success: false, error: "FAILED" };
  }
}
