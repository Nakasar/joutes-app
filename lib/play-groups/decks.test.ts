import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canPinGroupDeck,
  canRemoveGroupDeck,
  filterGroupDecks,
  readGroupDeckFilters,
  refuseGroupDeckAdd,
  type GroupDeckEntry,
} from "./decks";

/**
 * La bibliothèque de decks d'un groupe : qui ajoute, qui retire, et l'ordre
 * dans lequel la vue présente les decks.
 *
 * Exécution : `npm run test`.
 */

describe("refuseGroupDeckAdd", () => {
  const deck = { playerId: "auteur", gameId: "riftbound" };

  it("laisse l'auteur, membre, partager son deck", () => {
    assert.equal(refuseGroupDeckAdd({ deck, userId: "auteur", role: "member", isGameEnabled: true }), null);
  });

  it("refuse un non-membre", () => {
    assert.equal(refuseGroupDeckAdd({ deck, userId: "auteur", role: null, isGameEnabled: true }), "NOT_MEMBER");
  });

  it("refuse le deck d'un autre, même à un admin", () => {
    assert.equal(refuseGroupDeckAdd({ deck, userId: "admin", role: "admin", isGameEnabled: true }), "NOT_OWNER");
  });

  it("refuse un deck méta importé", () => {
    const imported = {
      ...deck,
      meta: { imported: true, source: "RC Europe", eventDate: new Date("2026-11-06") },
    };
    assert.equal(
      refuseGroupDeckAdd({ deck: imported, userId: "auteur", role: "member", isGameEnabled: true }),
      "META_IMPORTED",
    );
  });

  it("refuse un jeu que le groupe n'a pas activé", () => {
    assert.equal(refuseGroupDeckAdd({ deck, userId: "auteur", role: "owner", isGameEnabled: false }), "GAME_DISABLED");
  });
});

describe("canRemoveGroupDeck", () => {
  const link = { ownerId: "auteur" };

  it("l'auteur retire son deck", () => {
    assert.equal(canRemoveGroupDeck(link, "auteur", "member"), true);
  });

  it("un admin ou le fondateur retire le deck d'un membre", () => {
    assert.equal(canRemoveGroupDeck(link, "adjoint", "admin"), true);
    assert.equal(canRemoveGroupDeck(link, "fondateur", "owner"), true);
  });

  it("un autre membre ne le retire pas", () => {
    assert.equal(canRemoveGroupDeck(link, "voisin", "member"), false);
  });

  it("l'auteur sorti du groupe ne le retire plus d'ici", () => {
    assert.equal(canRemoveGroupDeck(link, "auteur", null), false);
  });
});

describe("canPinGroupDeck", () => {
  it("réserve l'épinglage aux admins", () => {
    assert.equal(canPinGroupDeck("member"), false);
    assert.equal(canPinGroupDeck("admin"), true);
    assert.equal(canPinGroupDeck(null), false);
  });
});

describe("readGroupDeckFilters", () => {
  it("lit les clés de la vue et ignore les valeurs vides", () => {
    assert.deepEqual(readGroupDeckFilters({ jeu: "riftbound", legende: " ", membre: ["mehdi", "lisa"], q: " Kai " }), {
      gameId: "riftbound",
      ownerId: "mehdi",
      query: "Kai",
    });
  });
});

function entry(
  name: string,
  updatedAt: string,
  overrides: { pinnedAt?: string; ownerId?: string; legendName?: string; domains?: string[]; gameId?: string } = {},
): GroupDeckEntry {
  return {
    link: {
      playGroupId: "g",
      deckId: name,
      gameId: overrides.gameId ?? "riftbound",
      ownerId: overrides.ownerId ?? "auteur",
      addedBy: overrides.ownerId ?? "auteur",
      addedAt: "2026-11-01T00:00:00.000Z",
      ...(overrides.pinnedAt ? { pinnedAt: overrides.pinnedAt } : {}),
    },
    deck: {
      id: name,
      name,
      gameId: overrides.gameId ?? "riftbound",
      legendName: overrides.legendName,
      domains: overrides.domains ?? [],
      updatedAt: new Date(updatedAt),
    },
  };
}

describe("filterGroupDecks", () => {
  const decks = [
    entry("Riven Calm", "2026-11-01", { legendName: "Riven, The Exile", domains: ["Calm", "Chaos"] }),
    entry("Kai'Sa Fury/Mind", "2026-11-08", { ownerId: "moi", domains: ["Fury", "Mind"] }),
    entry("Kennen Tempête", "2026-11-05", { pinnedAt: "2026-11-02T00:00:00.000Z", legendName: "Kennen" }),
    entry("Vader Aggro", "2026-11-09", { gameId: "swu" }),
  ];

  it("met les épinglés en tête, puis les plus récemment modifiés", () => {
    assert.deepEqual(
      filterGroupDecks(decks, {}).map((item) => item.deck.name),
      ["Kennen Tempête", "Vader Aggro", "Kai'Sa Fury/Mind", "Riven Calm"],
    );
  });

  it("filtre par jeu, membre et domaine", () => {
    assert.deepEqual(
      filterGroupDecks(decks, { gameId: "riftbound", ownerId: "moi" }).map((item) => item.deck.name),
      ["Kai'Sa Fury/Mind"],
    );
    assert.deepEqual(
      filterGroupDecks(decks, { domain: "Calm" }).map((item) => item.deck.name),
      ["Riven Calm"],
    );
  });

  it("cherche dans le nom et la légende, sans accents ni casse", () => {
    assert.deepEqual(
      filterGroupDecks(decks, { query: "tempete" }).map((item) => item.deck.name),
      ["Kennen Tempête"],
    );
    assert.deepEqual(
      filterGroupDecks(decks, { query: "exile" }).map((item) => item.deck.name),
      ["Riven Calm"],
    );
  });
});
