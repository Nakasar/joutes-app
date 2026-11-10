"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth.ts";
import { searchDecks } from "@/lib/db/decks.ts";
import { listPlayGroupDecks } from "@/lib/db/play-group-decks.ts";
import { getPlayGroupById, isGameEnabledForPlayGroup } from "@/lib/db/play-groups.ts";
import { readMemberRole } from "@/lib/play-groups/access.ts";
import {
  addDecksToGroup,
  pinDeckInGroup,
  removeDeckFromGroup,
  type AddGroupDecksOutcome,
} from "@/lib/play-groups/deck-library.ts";
import { refuseGroupDeckAdd, type GroupDeckRefusal } from "@/lib/play-groups/decks.ts";
import type { DeckVisibility } from "@/lib/types/Deck.ts";
import type { PlayGroup, PlayGroupMemberRole } from "@/lib/types/PlayGroup";

import { revalidateGroupDecks } from "./revalidate.ts";

/**
 * Les actions de la bibliothèque de decks d'un groupe.
 *
 * Les règles sont dans `lib/play-groups/decks.ts` et appliquées par
 * `deck-library.ts`, que sert aussi la route d'API : ces actions ne font
 * qu'ouvrir la porte (session, groupe, rôle) et rafraîchir les pages.
 * Les échecs sortent en codes, traduits par le composant qui appelle.
 */

export type GroupDeckActionError = "UNAUTHENTICATED" | "NOT_MEMBER" | "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "FAILED";

type Failure = { success: false; error: GroupDeckActionError };

type Gate = { userId: string; role: PlayGroupMemberRole | null; group: PlayGroup };

async function readUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

async function openGroup(playGroupId: string): Promise<Gate | Failure> {
  const userId = await readUserId();
  if (!userId) {
    return { success: false, error: "UNAUTHENTICATED" };
  }

  const group = await getPlayGroupById(playGroupId);
  if (!group) {
    return { success: false, error: "NOT_FOUND" };
  }

  const role = readMemberRole(group, userId);
  if (!role) {
    return { success: false, error: "NOT_MEMBER" };
  }

  return { userId, role, group };
}

export type MyDeckForGroup = {
  id: string;
  name: string;
  gameId: string;
  visibility: DeckVisibility;
  legendName?: string;
  domains: string[];
  shared: boolean;
  /** Pourquoi ce deck ne peut pas entrer dans le groupe, s'il ne le peut pas. */
  refusal?: GroupDeckRefusal;
};

/** Mes decks, pour la fenêtre « Ajouter mes decks » : ceux déjà partagés sont marqués. */
export async function listMyDecksForGroup(
  playGroupId: string,
): Promise<{ success: true; decks: MyDeckForGroup[] } | Failure> {
  try {
    const gate = await openGroup(playGroupId);
    if ("error" in gate) return gate;

    const [result, links] = await Promise.all([
      searchDecks({ scope: "mine", viewerId: gate.userId, sortBy: "updatedAt", sortOrder: "desc", limit: 200 }),
      listPlayGroupDecks(playGroupId),
    ]);
    const shared = new Set(links.map((link) => link.deckId));

    const decks = result.decks.flatMap((deck): MyDeckForGroup[] => {
      const refusal = refuseGroupDeckAdd({
        deck,
        userId: gate.userId,
        role: gate.role,
        isGameEnabled: isGameEnabledForPlayGroup(gate.group, deck.gameId),
      });
      // Un deck méta importé n'est pas « à moi » au sens où l'entend la
      // fenêtre : il n'a rien à y faire, même grisé.
      if (refusal === "META_IMPORTED") return [];

      return [
        {
          id: deck.id,
          name: deck.name,
          gameId: deck.gameId,
          visibility: deck.visibility,
          legendName: deck.legendName,
          domains: deck.domains ?? [],
          shared: shared.has(deck.id),
          refusal: refusal ?? undefined,
        },
      ];
    });

    return { success: true, decks };
  } catch (error) {
    console.error("listMyDecksForGroup", error);
    return { success: false, error: "FAILED" };
  }
}

export async function addDecksToGroupAction(
  playGroupId: string,
  deckIds: string[],
): Promise<({ success: true } & AddGroupDecksOutcome) | Failure> {
  if (!Array.isArray(deckIds) || deckIds.length === 0 || deckIds.length > 50) {
    return { success: false, error: "INVALID" };
  }

  try {
    const gate = await openGroup(playGroupId);
    if ("error" in gate) return gate;

    const outcome = await addDecksToGroup(gate.group, gate, deckIds.map(String));
    revalidateGroupDecks([playGroupId]);

    return { success: true, ...outcome };
  } catch (error) {
    console.error("addDecksToGroupAction", error);
    return { success: false, error: "FAILED" };
  }
}

export async function removeDeckFromGroupAction(
  playGroupId: string,
  deckId: string,
): Promise<{ success: true } | Failure> {
  try {
    const gate = await openGroup(playGroupId);
    if ("error" in gate) return gate;

    const change = await removeDeckFromGroup(playGroupId, gate, deckId);
    if (change !== "OK") {
      return { success: false, error: change };
    }

    revalidateGroupDecks([playGroupId], deckId);
    return { success: true };
  } catch (error) {
    console.error("removeDeckFromGroupAction", error);
    return { success: false, error: "FAILED" };
  }
}

export async function pinDeckInGroupAction(
  playGroupId: string,
  deckId: string,
  pinned: boolean,
  note?: string,
): Promise<{ success: true } | Failure> {
  const trimmed = note?.trim().slice(0, 60);

  try {
    const gate = await openGroup(playGroupId);
    if ("error" in gate) return gate;

    const change = await pinDeckInGroup(playGroupId, gate.role, deckId, pinned ? { note: trimmed || undefined } : null);
    if (change !== "OK") {
      return { success: false, error: change };
    }

    revalidateGroupDecks([playGroupId]);
    return { success: true };
  } catch (error) {
    console.error("pinDeckInGroupAction", error);
    return { success: false, error: "FAILED" };
  }
}
