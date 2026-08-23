import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deckImageUploadPathname } from "./deck-images";

/**
 * Le nom du fichier qu'un utilisateur dépose n'est pas de confiance, et il
 * repart pourtant dans une URL.
 *
 * Exécution : `npm run test`.
 */

describe("deckImageUploadPathname", () => {
  it("préfixe par le dossier des listes, sans barre oblique en tête", () => {
    assert.equal(deckImageUploadPathname("photo.jpg"), "deck-images/photo.jpg");
  });

  it("laisse passer points, tirets et soulignés", () => {
    assert.equal(deckImageUploadPathname("ma_liste-2.jpg"), "deck-images/ma_liste-2.jpg");
  });

  it("remplace ce qui ne peut pas tenir dans un segment d'URL", () => {
    assert.equal(deckImageUploadPathname("ma liste (1).jpg"), "deck-images/ma-liste-1-.jpg");
    assert.equal(deckImageUploadPathname("été/deck.png"), "deck-images/t-deck.png");
  });

  it("ne laisse pas un nom commencer par un point ou un tiret", () => {
    assert.equal(deckImageUploadPathname("../secret.png"), "deck-images/secret.png");
    assert.equal(deckImageUploadPathname(".cache"), "deck-images/cache");
  });

  it("donne un repli à un nom qui ne laisse rien", () => {
    assert.equal(deckImageUploadPathname("???"), "deck-images/deck-list");
    assert.equal(deckImageUploadPathname(""), "deck-images/deck-list");
  });
});
