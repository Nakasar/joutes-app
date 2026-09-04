import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAppBlobImageUrl } from "./blob-image-url";

/**
 * L'adresse d'une image que l'application accepte d'afficher.
 *
 * Ce que ces cas verrouillent : rien d'autre que le stockage de Joutes ne
 * passe. La règle sert de garde à toutes les couvertures — decks, quizz — dont
 * l'adresse arrive du client, et un hôte tiers qui passerait ferait charger son
 * image, donc relever l'adresse IP, à chaque lecteur d'un contenu public.
 *
 * Exécution : `npm run test`.
 */

describe("isAppBlobImageUrl", () => {
  it("accepte le stockage de l'application", () => {
    assert.equal(
      isAppBlobImageUrl("https://uiez8a3cxaj4q4wl.public.blob.vercel-storage.com/quizzes/covers/a.png"),
      true,
    );
    assert.equal(isAppBlobImageUrl("https://blob.vercel-storage.com/a.png"), true);
  });

  it("refuse un hôte tiers", () => {
    assert.equal(isAppBlobImageUrl("https://exemple.test/image.png"), false);
  });

  it("refuse un hôte qui imite le suffixe", () => {
    // Le point compte : `evilpublic.blob.vercel-storage.com` n'est pas un
    // sous-domaine du stockage.
    assert.equal(isAppBlobImageUrl("https://evilpublic.blob.vercel-storage.com/a.png"), false);
    // Et le suffixe doit finir l'hôte, pas s'y trouver.
    assert.equal(isAppBlobImageUrl("https://public.blob.vercel-storage.com.attaquant.test/a.png"), false);
  });

  it("refuse le http en clair", () => {
    assert.equal(isAppBlobImageUrl("http://x.public.blob.vercel-storage.com/a.png"), false);
  });

  it("refuse ce qui n'est pas une adresse", () => {
    assert.equal(isAppBlobImageUrl(""), false);
    assert.equal(isAppBlobImageUrl("/quizzes/covers/a.png"), false);
    assert.equal(isAppBlobImageUrl("javascript:alert(1)"), false);
  });
});
