import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gameLinksSchema } from "@/lib/schemas/game.schema";

/**
 * La validation des liens d'un jeu.
 *
 * Ce que ces cas verrouillent : un champ vidé retire son lien plutôt que
 * d'échouer, et **rien n'est accepté que la fiche refuserait ensuite
 * d'afficher**. C'est ce second point qui compte : un contrôle de préfixe
 * laissait passer `https://`, l'enregistrement réussissait, et le lien
 * disparaissait en silence au rendu, sans que rien ne dise pourquoi.
 *
 * Exécution : `npm run test`.
 */

function parse(links: Record<string, string>) {
  return gameLinksSchema.safeParse(links);
}

describe("gameLinksSchema", () => {
  it("accepte les adresses des réseaux d'un éditeur", () => {
    const result = parse({
      youtube: "https://www.youtube.com/@riftbound",
      x: "https://x.com/playriftbound",
      instagram: "https://www.instagram.com/playriftbound/",
      tiktok: "https://www.tiktok.com/@riftbound",
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      youtube: "https://www.youtube.com/@riftbound",
      x: "https://x.com/playriftbound",
      instagram: "https://www.instagram.com/playriftbound/",
      tiktok: "https://www.tiktok.com/@riftbound",
    });
  });

  it("rend `undefined` pour un champ vidé — c'est ainsi qu'on retire un lien", () => {
    const result = parse({ x: "", youtube: "   " });

    assert.equal(result.success, true);
    assert.equal(result.data?.x, undefined);
    assert.equal(result.data?.youtube, undefined);
    assert.ok("x" in (result.data ?? {}), "la clé reste présente, pour que `setGameLinks` l'efface");
  });

  it("refuse ce que `new URL()` refuse, et pas seulement le mauvais protocole", () => {
    for (const value of ["https://", "http://", "http://a b", "youtube.com/@riftbound", "@riftbound"]) {
      assert.equal(parse({ youtube: value }).success, false, `attendu un refus pour ${JSON.stringify(value)}`);
    }
  });

  it("refuse un protocole qui trouverait une exécution au clic", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,<script></script>"]) {
      assert.equal(parse({ website: value }).success, false, `attendu un refus pour ${JSON.stringify(value)}`);
    }
  });

  it("refuse une adresse trop longue pour un document", () => {
    assert.equal(parse({ website: `https://exemple.fr/${"a".repeat(500)}` }).success, false);
  });
});
