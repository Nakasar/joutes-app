import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Wishlist } from "@/lib/types/Wishlist";
import { type MyWishlists, pickShortcutWishlist } from "./shortcut";

/**
 * Tests du raccourci « ajouter à ma liste ». Ce qui compte ici : le raccourci
 * ne choisit jamais à la place de l'utilisateur — il suit sa dernière liste, ou
 * la seule qu'il ait, ou il s'efface.
 *
 * Exécution : `npm run test`.
 */

function wishlist(id: string, name: string): Wishlist {
  return { id, name, ownerType: "user", ownerId: "u1", visibility: "private" } as Wishlist;
}

const mine = wishlist("w1", "Ma liste");
const other = wishlist("w2", "Cadeaux");
const groupList = wishlist("g1", "Liste du groupe");

const twoPersonal: MyWishlists = { personal: [mine, other], groups: [] };
const onePersonal: MyWishlists = { personal: [mine], groups: [] };
const groupOnly: MyWishlists = {
  personal: [],
  groups: [{ group: { id: "grp", name: "Les copains" }, wishlists: [groupList] }],
};

describe("pickShortcutWishlist", () => {
  it("suit la dernière liste utilisée", () => {
    assert.equal(pickShortcutWishlist(twoPersonal, "w2")?.id, "w2");
  });

  it("accepte une liste de groupe comme préférence explicite", () => {
    assert.equal(pickShortcutWishlist(groupOnly, "g1")?.id, "g1");
  });

  it("retombe sur l'unique liste personnelle quand la préférence a disparu", () => {
    assert.equal(pickShortcutWishlist(onePersonal, "supprimée")?.id, "w1");
  });

  it("s'efface devant deux listes sans préférence", () => {
    assert.equal(pickShortcutWishlist(twoPersonal, null), null);
  });

  it("ne verse jamais d'office dans une liste de groupe", () => {
    assert.equal(pickShortcutWishlist(groupOnly, null), null);
  });

  it("s'efface quand l'utilisateur n'a aucune liste", () => {
    assert.equal(pickShortcutWishlist({ personal: [], groups: [] }, "w1"), null);
  });
});
