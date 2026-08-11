import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUEST_ID_PREFIX,
  MAX_GUESTS,
  guestId,
  isGuestId,
  isParticipant,
  normalizeGuests,
  participantIds,
  toGuestPlayer,
} from "./participants";

/**
 * Tests des participants d'une partie. Ce qui compte ici, c'est qu'un invité
 * soit un participant comme un autre — il gagne, il vote, il aligne une armée —
 * sans jamais pouvoir être pris pour un compte.
 *
 * Exécution : `npm run test`.
 */

const player = (userId: string, username: string) => ({ userId, username });

describe("isGuestId", () => {
  it("reconnaît un identifiant d'invité", () => {
    assert.equal(isGuestId(guestId("aBc12345")), true);
  });

  it("ne prend pas un ObjectId de compte pour un invité", () => {
    assert.equal(isGuestId("507f1f77bcf86cd799439011"), false);
  });

  it("refuse un préfixe seul ou un suffixe hors alphabet", () => {
    assert.equal(isGuestId(GUEST_ID_PREFIX), false);
    assert.equal(isGuestId("guest_avec des espaces"), false);
  });
});

describe("toGuestPlayer", () => {
  it("rend un invité sous la forme d'un participant, marqué comme tel", () => {
    assert.deepEqual(toGuestPlayer({ id: guestId("kevin123"), name: "Kévin" }), {
      userId: guestId("kevin123"),
      username: "Kévin",
      isGuest: true,
    });
  });
});

describe("isParticipant", () => {
  // La liste mêlée, telle que la lecture la rend : comptes puis invités.
  const match = {
    players: [
      player("507f1f77bcf86cd799439011", "Alice#0001"),
      toGuestPlayer({ id: guestId("kevin123"), name: "Kévin" }),
    ],
  };

  it("reconnaît un compte comme un invité", () => {
    assert.equal(isParticipant(match, "507f1f77bcf86cd799439011"), true);
    assert.equal(isParticipant(match, guestId("kevin123")), true);
  });

  it("rejette qui n'est pas à la table", () => {
    assert.equal(isParticipant(match, guestId("inconnu1")), false);
    assert.equal(isParticipant(match, "507f1f77bcf86cd799439099"), false);
  });

  it("tient sur une partie sans personne", () => {
    assert.deepEqual(participantIds({}), []);
  });
});

describe("normalizeGuests", () => {
  it("débarrasse les noms de leurs espaces et écarte les sans-nom", () => {
    const guests = normalizeGuests([
      { id: guestId("kevin123"), name: "  Kévin  " },
      { id: guestId("vide1234"), name: "   " },
    ]);

    assert.deepEqual(guests, [{ id: guestId("kevin123"), name: "Kévin" }]);
  });

  it("garde deux invités homonymes, que seul l'identifiant sépare", () => {
    const guests = normalizeGuests([
      { id: guestId("kevin111"), name: "Kévin" },
      { id: guestId("kevin222"), name: "Kévin" },
    ]);

    assert.equal(guests.length, 2);
  });

  it("écarte les doublons d'identifiant, en gardant le premier", () => {
    const guests = normalizeGuests([
      { id: guestId("kevin123"), name: "Kévin" },
      { id: guestId("kevin123"), name: "Kevin bis" },
    ]);

    assert.deepEqual(guests, [{ id: guestId("kevin123"), name: "Kévin" }]);
  });

  it("refuse un identifiant qui n'a pas la forme d'un invité", () => {
    // Sans quoi un client pourrait glisser l'ObjectId d'un compte dans la liste
    // des invités, et lui prêter des droits qu'il n'a pas.
    const guests = normalizeGuests([
      { id: "507f1f77bcf86cd799439011", name: "Faux compte" },
      { id: guestId("kevin123"), name: "Kévin" },
    ]);

    assert.deepEqual(guests, [{ id: guestId("kevin123"), name: "Kévin" }]);
  });

  it("plafonne le nombre d'invités", () => {
    const guests = normalizeGuests(
      Array.from({ length: MAX_GUESTS + 5 }, (_, index) => ({
        id: guestId(`invite${index}`),
        name: `Invité ${index}`,
      }))
    );

    assert.equal(guests.length, MAX_GUESTS);
  });
});
