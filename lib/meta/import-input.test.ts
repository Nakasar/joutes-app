import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatPlacement, splitMetaImportInput } from "@/lib/meta/import-input";
import { deckFingerprint, looseCardKey } from "@/lib/meta/fingerprint";

const LINK = "https://piltoverarchive.com/decks/view/7f3c1e2a-91b4-4c0e-a1f2-5d0b8e1c9a77";
const CODE = "CMAAAAAGAQAQCAYEBYCQGBQCAEBQKBQGBAAQEBYHA4EAEBQDAEBQMAQDAEAQEAI";

describe("splitMetaImportInput", () => {
  it("lit un lien et un code par ligne, avec classement et joueur", () => {
    const entries = splitMetaImportInput(`${LINK} #1 @Kevin\n${CODE} #3-4\n`);

    assert.deepEqual(entries, [
      {
        kind: "piltover-link",
        line: 1,
        deckId: "7f3c1e2a-91b4-4c0e-a1f2-5d0b8e1c9a77",
        url: LINK,
        placement: "1",
        pilot: "Kevin",
      },
      { kind: "piltover-code", line: 2, code: CODE, placement: "3-4" },
    ]);
  });

  it("lit une liste entre deux lignes --- et ses annotations", () => {
    const entries = splitMetaImportInput(
      [LINK, "---", "# Top 8", "@Alice", "Legend:", "1 Viktor, Herald of the Arcane", "", "3 Cloth Armor", "---", CODE].join("\n")
    );

    assert.equal(entries.length, 3);
    assert.equal(entries[1].kind, "list");
    assert.deepEqual(entries[1], {
      kind: "list",
      line: 3,
      text: "Legend:\n1 Viktor, Herald of the Arcane\n\n3 Cloth Armor",
      placement: "Top 8",
      pilot: "Alice",
    });
    assert.equal(entries[2].kind, "piltover-code");
  });

  it("ferme la liste à la fin du texte même sans second ---", () => {
    const entries = splitMetaImportInput(`${LINK}\n---\n3 Cleave\n2 Defy`);

    assert.equal(entries.length, 2);
    assert.deepEqual(entries[1], { kind: "list", line: 3, text: "3 Cleave\n2 Defy" });
  });

  it("prend des lignes de cartes sans --- pour une liste", () => {
    const entries = splitMetaImportInput("Legend:\n1 Jinx, Loose Cannon\n\nMain:\n3 Cleave");

    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, "list");
  });

  it("lit # et @ avant une liste sans --- comme ses annotations", () => {
    const entries = splitMetaImportInput("# 1\n@Alice\nLegend:\n1 Jinx, Loose Cannon\n# 2\nLegend:\n1 Viktor");

    assert.equal(entries.length, 2);
    assert.equal(entries[0].kind, "list");
    assert.equal(entries[0].placement, "1");
    assert.equal(entries[0].pilot, "Alice");
    assert.ok(entries[0].kind === "list" && !entries[0].text.includes("#") && !entries[0].text.includes("@"));
    assert.equal(entries[1].placement, "2");
    assert.ok(entries[1].kind === "list" && entries[1].text.includes("Viktor"));
  });

  it("signale un lien qui n'est pas Piltover Archive", () => {
    const [entry] = splitMetaImportInput("https://example.com/deck/1");

    assert.equal(entry.kind, "invalid");
  });

  it("ignore les lignes vides et ne crée pas de liste vide", () => {
    assert.deepEqual(splitMetaImportInput("\n\n---\n---\n"), []);
  });
});

describe("formatPlacement", () => {
  it("écrit les rangs en français", () => {
    assert.equal(formatPlacement("1"), "1er");
    assert.equal(formatPlacement("2"), "2e");
    assert.equal(formatPlacement("3-4"), "3e-4e");
    assert.equal(formatPlacement("Top 8"), "Top 8");
    assert.equal(formatPlacement("  "), undefined);
  });
});

describe("deckFingerprint", () => {
  const names: Record<string, string> = { a: "Cleave", a2: "Cleave", b: "Defy", l: "Jinx, Loose Cannon" };
  const nameOf = (id: string) => names[id];

  it("ne dépend ni de l'ordre ni de l'impression", () => {
    const one = deckFingerprint({ legend: [{ cardId: "l", quantity: 1 }], maindeck: [{ cardId: "a", quantity: 3 }, { cardId: "b", quantity: 2 }] }, nameOf);
    const two = deckFingerprint({ maindeck: [{ cardId: "b", quantity: 2 }, { cardId: "a2", quantity: 3 }], legend: [{ cardId: "l", quantity: 1 }] }, nameOf);

    assert.equal(one, two);
  });

  it("change avec les quantités et les zones", () => {
    const base = deckFingerprint({ maindeck: [{ cardId: "a", quantity: 3 }] }, nameOf);

    assert.notEqual(base, deckFingerprint({ maindeck: [{ cardId: "a", quantity: 2 }] }, nameOf));
    assert.notEqual(base, deckFingerprint({ sideboard: [{ cardId: "a", quantity: 3 }] }, nameOf));
  });
});

describe("looseCardKey", () => {
  it("rapproche les noms qui ne diffèrent que par la ponctuation", () => {
    assert.equal(looseCardKey("Kings Edict"), looseCardKey("King’s Edict"));
    assert.equal(looseCardKey("Kha'Zix, Mutating Horror"), looseCardKey("KhaZix Mutating Horror"));
  });
});
