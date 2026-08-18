import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Wishlist } from "@/lib/types/Wishlist";
import {
  DEFAULT_WISHLIST_NAME,
  type MyWishlists,
  allWishlists,
  pickShortcutTarget,
  pickShortcutWishlist,
} from "./shortcut";

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

describe("pickShortcutTarget", () => {
  it("vise la liste par défaut quand elle existe", () => {
    assert.deepEqual(pickShortcutTarget(twoPersonal), { kind: "existing", wishlist: mine });
  });

  it("propose de créer « Générale » à un compte sans liste", () => {
    assert.deepEqual(pickShortcutTarget({ personal: [], groups: [] }), {
      kind: "create",
      name: DEFAULT_WISHLIST_NAME,
    });
  });

  it("propose aussi la création à qui n'a que des listes de groupe", () => {
    // Le raccourci ne vise jamais une liste de groupe : sans liste personnelle,
    // il n'a rien à viser, et en créer une est ce qui rend le geste possible.
    assert.deepEqual(pickShortcutTarget(groupOnly), { kind: "create", name: DEFAULT_WISHLIST_NAME });
  });

  it("ne crée rien quand des listes existent sans liste par défaut", () => {
    // Ne devrait pas arriver — la création en désigne une, et `lib/db` rattrape
    // les comptes d'avant le champ. En créer une de plus ici pourrait buter sur
    // la limite au lieu d'ajouter la carte.
    assert.equal(pickShortcutTarget(noDefault), null);
  });
});
