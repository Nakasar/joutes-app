import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCardIdList, planPrintingAddition } from "./bulk-printings";
import { MAX_CARD_PRINTINGS } from "@/lib/schemas/card.schema";

/**
 * Ce qui compte ici : une même variante appliquée à des centaines de cartes ne
 * doit ni se dupliquer, ni détacher les exemplaires de collection de leur
 * variante en changeant son identifiant.
 *
 * Exécution : `npm run test`.
 */

describe("parseCardIdList", () => {
  it("accepte les séparateurs d'un copier-coller de liste comme de tableur", () => {
    assert.deepEqual(parseCardIdList("SFD125\nSFD126, SFD127;SFD128 SFD129"), [
      "SFD125",
      "SFD126",
      "SFD127",
      "SFD128",
      "SFD129",
    ]);
  });

  it("retire les doublons en gardant l'ordre saisi", () => {
    assert.deepEqual(parseCardIdList("SFD125 SFD126 SFD125"), ["SFD125", "SFD126"]);
  });

  it("ne renvoie rien pour une saisie vide", () => {
    assert.deepEqual(parseCardIdList("   \n\n  "), []);
  });

  it("laisse la casse intacte : un identifiant mêle extension et numéro", () => {
    assert.deepEqual(parseCardIdList("SOR-001a\nsfd125"), ["SOR-001a", "sfd125"]);
  });
});

describe("planPrintingAddition", () => {
  const promo = { name: "Promo Pack", foil: true, image: "https://example.test/promo.png" };

  it("ajoute la variante à une carte qui n'en a aucune", () => {
    const plan = planPrintingAddition(undefined, promo, { replaceExisting: false });

    assert.equal(plan.action, "add");
    assert.deepEqual(plan.action === "add" ? plan.printings : [], [
      { id: "promo-pack", name: "Promo Pack", foil: true, image: "https://example.test/promo.png" },
    ]);
  });

  it("n'écrit pas les champs vides", () => {
    const plan = planPrintingAddition([], { name: "Standard" }, { replaceExisting: false });

    assert.deepEqual(plan.action === "add" ? plan.printings : [], [{ id: "standard", name: "Standard" }]);
  });

  it("ajoute à la suite des variantes existantes", () => {
    const plan = planPrintingAddition([{ id: "standard", name: "Standard" }], promo, { replaceExisting: false });

    assert.equal(plan.action === "add" ? plan.printings.length : 0, 2);
    assert.equal(plan.action === "add" ? plan.printings[0].id : "", "standard");
  });

  it("laisse la carte tranquille quand la variante y est déjà", () => {
    const plan = planPrintingAddition([{ id: "promo-pack", name: "Promo Pack" }], promo, { replaceExisting: false });

    assert.equal(plan.action, "skip");
  });

  it("reconnaît la variante par son nom même si son identifiant diffère", () => {
    const plan = planPrintingAddition([{ id: "pp-2024", name: "promo pack" }], promo, { replaceExisting: false });

    assert.equal(plan.action, "skip");
  });

  it("remplace sur demande en gardant l'identifiant existant", () => {
    const plan = planPrintingAddition([{ id: "pp-2024", name: "Promo Pack", image: "https://old.test/x.png" }], promo, {
      replaceExisting: true,
    });

    assert.equal(plan.action, "replace");
    assert.deepEqual(plan.action === "replace" ? plan.printings : [], [
      { id: "pp-2024", name: "Promo Pack", foil: true, image: "https://example.test/promo.png" },
    ]);
  });

  it("donne un identifiant à une variante existante qui n'en avait pas", () => {
    const plan = planPrintingAddition(
      [{ name: "Promo Pack" } as { id: string; name: string }],
      promo,
      { replaceExisting: true }
    );

    assert.equal(plan.action === "replace" ? plan.printings[0].id : "", "promo-pack");
  });

  it("reconnaît une variante renommée par son identifiant, sans en créer une seconde", () => {
    // Renommer une variante ne change pas son identifiant : « Autre variante »
    // sous `promo-pack` est bien la variante visée, pas une homonyme.
    const plan = planPrintingAddition([{ id: "promo-pack", name: "Autre variante" }], promo, {
      replaceExisting: false,
    });

    assert.equal(plan.action, "skip");
  });

  it("réécrit son nom quand on demande le remplacement", () => {
    const plan = planPrintingAddition([{ id: "promo-pack", name: "Autre variante" }], promo, {
      replaceExisting: true,
    });

    assert.deepEqual(plan.action === "replace" ? plan.printings : [], [
      { id: "promo-pack", name: "Promo Pack", foil: true, image: "https://example.test/promo.png" },
    ]);
  });

  it("refuse de dépasser le plafond de variantes du formulaire", () => {
    const full = Array.from({ length: MAX_CARD_PRINTINGS }, (_, index) => ({
      id: `variante-${index}`,
      name: `Variante ${index}`,
    }));

    assert.equal(planPrintingAddition(full, promo, { replaceExisting: false }).action, "limit");
  });

  it("remplace toujours une variante existante, même sur une carte pleine", () => {
    const full = Array.from({ length: MAX_CARD_PRINTINGS - 1 }, (_, index) => ({
      id: `variante-${index}`,
      name: `Variante ${index}`,
    }));
    full.push({ id: "promo-pack", name: "Promo Pack" });

    assert.equal(planPrintingAddition(full, promo, { replaceExisting: true }).action, "replace");
  });
});
