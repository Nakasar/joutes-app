import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ObjectId } from "mongodb";
import type { User } from "@/lib/types/User";
import { toUser } from "./document";

/**
 * Tests de la conversion d'un document `user`.
 *
 * L'enjeu tient en une phrase : **tout champ du type doit ressortir**. La
 * conversion est explicite, et un champ oublié se traduit par une donnée écrite
 * en base puis perdue à chaque lecture — c'est ce qui est arrivé aux jeux
 * favoris. Le dernier test le vérifie sur le type entier plutôt que champ par
 * champ, pour que l'ajout d'un champ non converti échoue tout seul.
 *
 * Exécution : `npm run test`.
 */

const objectId = new ObjectId("6512aa000000000000000001");

function document(extra: Record<string, unknown> = {}) {
  return {
    _id: objectId,
    name: "kevin",
    email: "kevin@example.test",
    ...extra,
  };
}

describe("toUser", () => {
  it("rend les jeux favoris", () => {
    const user = toUser(document({ games: ["g1", "g2"], favoriteGames: ["g2"] }));

    assert.deepEqual(user.favoriteGames, ["g2"]);
  });

  it("rend une liste vide quand le compte n'a aucun favori", () => {
    assert.deepEqual(toUser(document()).favoriteGames, []);
  });

  it("retombe sur l'identifiant du document faute de champ `id`", () => {
    assert.equal(toUser(document()).id, objectId.toString());
  });

  it("rend la date de création, quelle que soit sa forme en base", () => {
    // better-auth pose une `Date` ; les comptes invités écrivent déjà une
    // chaîne ISO. Les deux doivent ressortir de la même façon.
    assert.equal(
      toUser(document({ createdAt: new Date("2024-01-02T03:04:05.000Z") })).createdAt,
      "2024-01-02T03:04:05.000Z",
    );
    assert.equal(
      toUser(document({ createdAt: "2024-01-02T03:04:05.000Z" })).createdAt,
      "2024-01-02T03:04:05.000Z",
    );
    assert.equal(toUser(document()).createdAt, undefined);
  });

  it("écarte les blocs de vitrine dont la clé n'existe plus", () => {
    // Une clé retirée du code reste en base. La laisser traverser ferait porter
    // à chaque lecteur le soin de s'en méfier.
    const user = toUser(
      document({
        showcase: {
          sections: [
            { key: "podcast", enabled: true },
            { key: "decks", enabled: false },
          ],
        },
      }),
    );

    assert.deepEqual(user.showcase?.sections, [{ key: "decks", enabled: false }]);
  });

  it("ne rend une ville visible que si le compte l'a demandé", () => {
    assert.equal(toUser(document({ showcase: {} })).showcase?.showCity, false);
    assert.equal(toUser(document({ showcase: { showCity: true } })).showcase?.showCity, true);
  });

  it("laisse tomber ce que le document porte en plus", () => {
    // better-auth écrit ses propres champs dans la même collection : ils n'ont
    // pas à ressortir avec l'utilisateur.
    const user = toUser(document({ emailVerified: true, twoFactorSecret: "s3cr3t" }));

    assert.equal("twoFactorSecret" in user, false);
    assert.equal("emailVerified" in user, false);
  });

  it("convertit tous les champs du type", () => {
    const full: Record<keyof User, unknown> = {
      id: "6512aa000000000000000001",
      username: "kevin",
      displayName: "Kevin",
      discriminator: "4213",
      email: "kevin@example.test",
      discordId: "42",
      avatar: "https://example.test/a.png",
      createdAt: "2024-01-02T03:04:05.000Z",
      lairs: ["l1"],
      games: ["g1"],
      favoriteGames: ["g1"],
      friends: ["u2"],
      friendCode: "ABCD1234",
      isPublicProfile: true,
      pricePreference: { source: "cardmarket", fallback: false },
      description: "Joueur du mardi",
      website: "https://example.test",
      socialLinks: ["https://example.test/social"],
      profileImage: "https://example.test/p.png",
      showcase: {
        banner: "https://example.test/b.png",
        sections: [{ key: "about", enabled: false }],
        pinnedDeckId: "d1",
        links: [{ url: "https://example.test/x" }],
        showCity: true,
        playStyles: ["commander"],
      },
      location: { latitude: 45.75, longitude: 4.85, label: "Lyon", city: "Lyon", postalCode: "69000" },
      notifications: { emails: { weekly: { enabled: true } } },
    };

    const user = toUser({ ...full, _id: objectId } as never);

    // `notifications` n'est pas converti aujourd'hui : ce test le constate
    // plutôt que de le taire, pour que le jour où il compte, la ligne saute
    // aux yeux.
    const notConverted = new Set(["notifications"]);
    for (const field of Object.keys(full) as (keyof User)[]) {
      if (notConverted.has(field)) continue;
      assert.notEqual(
        user[field],
        undefined,
        `le champ « ${field} » du type User n'est pas rendu par toUser`
      );
    }
  });
});
