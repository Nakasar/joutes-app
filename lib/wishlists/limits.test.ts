import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FREE_WISHLIST_LIMIT,
  canCreateWishlist,
  hasReachedWishlistLimit,
  isWishlistReadOnly,
  wishlistLimitFor,
} from "./limits";

describe("limite de listes de souhaits", () => {
  it("laisse créer la première sans abonnement", () => {
    assert.equal(canCreateWishlist({ existing: 0, advanced: false }), true);
  });

  it("refuse la seconde sans abonnement", () => {
    assert.equal(canCreateWishlist({ existing: FREE_WISHLIST_LIMIT, advanced: false }), false);
  });

  it("n'en refuse aucune avec la gestion avancée", () => {
    for (const existing of [0, 1, 12, 300]) {
      assert.equal(canCreateWishlist({ existing, advanced: true }), true);
    }
  });

  it("ne réclame rien à qui en possédait déjà plusieurs", () => {
    // La limite s'applique à la création, jamais rétroactivement : un compte qui
    // tenait trois listes avant qu'elle n'existe les garde toutes. Il ne peut
    // simplement plus en ajouter — d'où le « supérieur ou égal ».
    assert.equal(hasReachedWishlistLimit({ existing: 3, advanced: false }), true);
    assert.equal(hasReachedWishlistLimit({ existing: 3, advanced: true }), false);
  });

  it("n'annonce une limite qu'à ceux qui en ont une", () => {
    assert.equal(wishlistLimitFor(false), FREE_WISHLIST_LIMIT);
    assert.equal(wishlistLimitFor(true), null);
  });
});

describe("lecture seule", () => {
  it("laisse la liste par défaut modifiable sans abonnement", () => {
    assert.equal(isWishlistReadOnly({ isDefault: true, advanced: false }), false);
  });

  it("verrouille les autres sans abonnement", () => {
    assert.equal(isWishlistReadOnly({ isDefault: false, advanced: false }), true);
  });

  it("ne verrouille rien avec la gestion avancée", () => {
    assert.equal(isWishlistReadOnly({ isDefault: false, advanced: true }), false);
    assert.equal(isWishlistReadOnly({ isDefault: true, advanced: true }), false);
  });
});
