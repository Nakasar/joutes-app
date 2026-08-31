import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCardId, buildPrintingId, withUniquePrintingIds } from "./card-ids";

/**
 * Identifiants des variantes d'impression : ils sont dérivés du nom, mais
 * doivent rester uniques au sein d'une carte et stables quand la variante est
 * renommée (l'identifiant déjà attribué est conservé tel quel).
 *
 * Exécution : `npm run test`.
 */

describe("buildCardId", () => {
  it("colle l'extension au numéro par défaut", () => {
    assert.equal(buildCardId("riftbound", "sfd", "125"), "SFD125");
  });

  it("sépare d'un tiret les jeux qui le veulent", () => {
    assert.equal(buildCardId("swu", "sor", "001"), "SOR-001");
    // Sorcery n'a pas de numéro de collection : c'est le slug de la carte.
    assert.equal(buildCardId("sorcery", "got", "abaddon-succubus"), "GOT-abaddon-succubus");
    // Cyberpunk suffixe ses numéros d'une lettre : le tiret dit où finit l'extension.
    assert.equal(buildCardId("cp", "wncb", "005a"), "WNCB-005a");
  });

  it("ne rend rien tant que l'extension ou le numéro manque", () => {
    assert.equal(buildCardId("sorcery", "got", ""), "");
    assert.equal(buildCardId("sorcery", "", "abaddon-succubus"), "");
  });
});

describe("buildPrintingId", () => {
  it("dérive un identifiant lisible du nom de la variante", () => {
    assert.equal(buildPrintingId("Promo Pack Nexus"), "promo-pack-nexus");
  });

  it("retire les accents et la ponctuation", () => {
    assert.equal(buildPrintingId("Édition Pré-release !"), "edition-pre-release");
  });

  it("retombe sur une valeur par défaut quand le nom ne donne aucun caractère utilisable", () => {
    assert.equal(buildPrintingId("!!!"), "variante");
  });
});

describe("withUniquePrintingIds", () => {
  it("complète les identifiants manquants", () => {
    const printings = withUniquePrintingIds([{ name: "Foil" }, { id: "", name: "Judge" }]);

    assert.deepEqual(
      printings.map((printing) => printing.id),
      ["foil", "judge"]
    );
  });

  it("conserve l'identifiant déjà attribué, même si le nom a changé", () => {
    const printings = withUniquePrintingIds([{ id: "promo-pack-nexus", name: "Promo Nexus 2024" }]);

    assert.equal(printings[0].id, "promo-pack-nexus");
  });

  it("lève les collisions entre variantes de même nom", () => {
    const printings = withUniquePrintingIds([{ name: "Promo" }, { name: "Promo" }, { name: "Promo" }]);

    assert.deepEqual(
      printings.map((printing) => printing.id),
      ["promo", "promo-2", "promo-3"]
    );
  });
});
