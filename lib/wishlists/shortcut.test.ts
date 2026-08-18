import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Wishlist } from "@/lib/types/Wishlist";
import { type MyWishlists, allWishlists, pickShortcutWishlist } from "./shortcut";

/**
 * Tests du raccourci « ajouter à ma liste ». Ce qui compte ici : le raccourci
 * vise la liste que l'utilisateur a désignée, et jamais une liste de groupe.
 *
 * Exécution : `npm run test`.
 */

function wishlist(id: string, name: string, isDefault = false): Wishlist {
  return { id, name, ownerType: "user", ownerId: "u1", visibility: "private", isDefault } as Wishlist;
}

const mine = wishlist("w1", "Ma liste", true);
const other = wishlist("w2", "Cadeaux");
const groupList = wishlist("g1", "Liste du groupe", true);

const twoPersonal: MyWishlists = { personal: [mine, other], groups: [] };
const noDefault: MyWishlists = { personal: [other], groups: [] };
const groupOnly: MyWishlists = {
  personal: [],
  groups: [{ group: { id: "grp", name: "Les copains" }, wishlists: [groupList] }],
};

describe("pickShortcutWishlist", () => {
  it("vise la liste par défaut", () => {
    assert.equal(pickShortcutWishlist(twoPersonal)?.id, "w1");
  });

  it("ne vise jamais une liste de groupe", () => {
    // Elles appartiennent à plusieurs : y verser une carte d'un geste distrait
    // se voit. Même marquée par défaut pour son groupe, elle est écartée.
    assert.equal(pickShortcutWishlist(groupOnly), null);
  });

  it("s'efface quand aucune liste personnelle n'est par défaut", () => {
    // Ne devrait pas arriver — la création en désigne une, et `lib/db` rattrape
    // les comptes d'avant le champ —, mais deviner ici serait pire que rien.
    assert.equal(pickShortcutWishlist(noDefault), null);
  });

  it("s'efface quand l'utilisateur n'a aucune liste", () => {
    assert.equal(pickShortcutWishlist({ personal: [], groups: [] }), null);
  });
});

describe("allWishlists", () => {
  it("réunit les listes personnelles et celles des groupes", () => {
    assert.deepEqual(
      allWishlists({ ...twoPersonal, groups: groupOnly.groups }).map((w) => w.id),
      ["w1", "w2", "g1"]
    );
  });
});
