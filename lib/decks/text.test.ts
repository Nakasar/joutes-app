import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyDeckText,
  normalizeCardName,
  parseDeckText,
  stringifyDeckText,
} from "@/lib/decks/text";
import { getDeckZones } from "@/lib/decks/zones";

const riftbound = getDeckZones({ slug: "riftbound" });

describe("lecture d'une liste collée", () => {
  it("reconnaît les en-têtes de section, français comme anglais", () => {
    const parsed = parseDeckText(
      ["Légende :", "1 Voix de la Faille", "MainDeck", "3 Éclat de Faille", "Sideboard:", "2 Verrou runique"].join("\n"),
      riftbound
    );

    assert.deepEqual(parsed.sections, ["legend", "maindeck", "sideboard"]);
    assert.deepEqual(parsed.lines, [
      { zone: "legend", name: "Voix de la Faille", quantity: 1 },
      { zone: "maindeck", name: "Éclat de Faille", quantity: 3 },
      { zone: "sideboard", name: "Verrou runique", quantity: 2 },
    ]);
  });

  it("range dans la zone principale ce qui précède tout en-tête", () => {
    const parsed = parseDeckText("3x Éclat de Faille\n- Marcheur des Dunes", riftbound);

    assert.deepEqual(parsed.lines, [
      { zone: "maindeck", name: "Éclat de Faille", quantity: 3 },
      { zone: "maindeck", name: "Marcheur des Dunes", quantity: 1 },
    ]);
  });

  it("fusionne deux lignes qui nomment la même carte", () => {
    const parsed = parseDeckText("2 Éclat de Faille\n1 Éclat de Faille", riftbound);

    assert.deepEqual(parsed.lines, [{ zone: "maindeck", name: "Éclat de Faille", quantity: 3 }]);
  });

  it("garde comme carte un en-tête inconnu du jeu", () => {
    const parsed = parseDeckText("Commandant\n2 Éclat de Faille", riftbound);

    assert.equal(parsed.lines[0].name, "Commandant");
    assert.deepEqual(parsed.sections, []);
  });
});

describe("appariement au catalogue", () => {
  const catalog = new Map([
    ["voix de la faille", "l1"],
    ["eclat de faille", "m1"],
  ]);
  const resolve = (name: string) => catalog.get(normalizeCardName(name));

  it("apparie sans tenir compte des accents ni de la casse", () => {
    const parsed = parseDeckText("Légende :\n1 VOIX DE LA FAILLE\n\nDeck principal :\n3 Eclat de Faille", riftbound);
    const applied = applyDeckText(parsed, resolve);

    assert.equal(applied.matched, 2);
    assert.deepEqual(applied.unmatched, []);
    assert.deepEqual(applied.cards.legend, [{ cardId: "l1", quantity: 1 }]);
    assert.deepEqual(applied.cards.maindeck, [{ cardId: "m1", quantity: 3 }]);
  });

  it("signale les noms qu'aucune carte ne porte", () => {
    const applied = applyDeckText(parseDeckText("2 Carte fantôme", riftbound), resolve);

    assert.equal(applied.matched, 0);
    assert.deepEqual(applied.unmatched, ["Carte fantôme"]);
  });
});

describe("écriture d'une liste", () => {
  it("écrit une section par zone non vide, dans l'ordre du jeu", () => {
    const names = new Map([
      ["l1", "Voix de la Faille"],
      ["m1", "Éclat de Faille"],
    ]);

    const text = stringifyDeckText(
      { legend: [{ cardId: "l1", quantity: 1 }], maindeck: [{ cardId: "m1", quantity: 3 }], runes: [] },
      riftbound,
      (id) => names.get(id)
    );

    assert.equal(text, "Légende :\n1 Voix de la Faille\n\nDeck principal :\n3 Éclat de Faille");
  });

  it("se relit elle-même", () => {
    const names = new Map([["m1", "Éclat de Faille"]]);
    const text = stringifyDeckText({ maindeck: [{ cardId: "m1", quantity: 3 }] }, riftbound, (id) => names.get(id));
    const parsed = parseDeckText(text, riftbound);

    assert.deepEqual(parsed.lines, [{ zone: "maindeck", name: "Éclat de Faille", quantity: 3 }]);
  });
});
