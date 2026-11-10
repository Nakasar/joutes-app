import { getDeckSummariesByIds } from "@/lib/db/decks";
import {
  addPlayGroupDecks,
  getPlayGroupDeck,
  listPlayGroupDecks,
  removePlayGroupDeck,
  setPlayGroupDeckPin,
} from "@/lib/db/play-group-decks";
import { isGameEnabledForPlayGroup } from "@/lib/db/play-groups";
import type { Deck } from "@/lib/types/Deck";
import type { PlayGroup, PlayGroupMemberRole } from "@/lib/types/PlayGroup";
import type { PlayGroupDeck } from "@/lib/types/PlayGroupDeck";
import { canPinGroupDeck, canRemoveGroupDeck, refuseGroupDeckAdd, type GroupDeckRefusal } from "./decks";

/**
 * La bibliothèque de decks d'un groupe, telle que la servent la vue et la
 * route d'API : les mêmes règles (`./decks.ts`), appliquées après lecture du
 * groupe et des decks. Les deux appelants ont déjà vérifié que le lecteur est
 * membre et connaissent son rôle.
 */

export type GroupLibraryEntry = { link: PlayGroupDeck; deck: Deck };

/** Les decks partagés au groupe, avec leur fiche résumée. Un deck disparu est ignoré. */
export async function readGroupDeckLibrary(playGroupId: string): Promise<GroupLibraryEntry[]> {
  const links = await listPlayGroupDecks(playGroupId);
  const decks = await getDeckSummariesByIds(links.map((link) => link.deckId));
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));

  return links.flatMap((link) => {
    const deck = deckById.get(link.deckId);

    return deck ? [{ link, deck }] : [];
  });
}

export type AddGroupDecksOutcome = {
  added: number;
  refused: { deckId: string; reason: GroupDeckRefusal | "NOT_FOUND" }[];
};

/** Partage au groupe ceux des decks demandés que le membre a le droit d'y mettre. */
export async function addDecksToGroup(
  group: Pick<PlayGroup, "id" | "enabledGameIds">,
  viewer: { userId: string; role: PlayGroupMemberRole | null },
  deckIds: string[],
): Promise<AddGroupDecksOutcome> {
  const decks = await getDeckSummariesByIds(deckIds);
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const refused: AddGroupDecksOutcome["refused"] = [];
  const accepted: Deck[] = [];

  for (const deckId of new Set(deckIds)) {
    const deck = deckById.get(deckId);
    if (!deck) {
      refused.push({ deckId, reason: "NOT_FOUND" });
      continue;
    }

    const reason = refuseGroupDeckAdd({
      deck,
      userId: viewer.userId,
      role: viewer.role,
      isGameEnabled: isGameEnabledForPlayGroup(group, deck.gameId),
    });
    if (reason) {
      refused.push({ deckId, reason });
    } else {
      accepted.push(deck);
    }
  }

  const added = await addPlayGroupDecks(group.id, accepted, viewer.userId);

  return { added, refused };
}

export type GroupDeckChange = "OK" | "NOT_FOUND" | "FORBIDDEN";

export async function removeDeckFromGroup(
  playGroupId: string,
  viewer: { userId: string; role: PlayGroupMemberRole | null },
  deckId: string,
): Promise<GroupDeckChange> {
  const link = await getPlayGroupDeck(playGroupId, deckId);
  if (!link) {
    return "NOT_FOUND";
  }
  if (!canRemoveGroupDeck(link, viewer.userId, viewer.role)) {
    return "FORBIDDEN";
  }

  await removePlayGroupDeck(playGroupId, deckId);
  return "OK";
}

export async function pinDeckInGroup(
  playGroupId: string,
  role: PlayGroupMemberRole | null,
  deckId: string,
  pin: { note?: string } | null,
): Promise<GroupDeckChange> {
  if (!canPinGroupDeck(role)) {
    return "FORBIDDEN";
  }

  const found = await setPlayGroupDeckPin(playGroupId, deckId, pin);
  return found ? "OK" : "NOT_FOUND";
}
