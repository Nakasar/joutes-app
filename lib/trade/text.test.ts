import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyTradeText, parseTradeText, stringifyTradeCards } from "./text";

/**
 * Lecture et écriture d'une offre d'échange au format texte.
 *
 * Exécution : `npm run test`.
 */

describe("parseTradeText", () => {
  it("lit une quantité, un nom, une extension et un numéro", () => {
    const parsed = parseTradeText("2 Voix de la Faille (OGN) 123");

    assert.deepEqual(parsed.lines, [
      { quantity: 2, name: "Voix de la Faille", setCode: "OGN", collectorNumber: "123" },
    ]);
    assert.deepEqual(parsed.ignored, []);
  });

  it("accepte les formes recopiées à la main", () => {
    const parsed = parseTradeText(
      ["3x Éclat de Faille (OGN)", "- Marcheur des Dunes (DUN) #7", "x2 Verrou runique", "  ", "// un commentaire"].join(
        "\n"
      )
    );

    assert.deepEqual(parsed.lines, [
      { quantity: 3, name: "Éclat de Faille", setCode: "OGN" },
      { quantity: 1, name: "Marcheur des Dunes", setCode: "DUN", collectorNumber: "7" },
      { quantity: 2, name: "Verrou runique" },
    ]);
  });

  it("laisse au nom les parenthèses qui lui appartiennent", () => {
    const parsed = parseTradeText("1 Voix de la Faille (version alternative) (OGN) 200");

    assert.deepEqual(parsed.lines, [
      { quantity: 1, name: "Voix de la Faille (version alternative)", setCode: "OGN", collectorNumber: "200" },
    ]);
  });

  it("ne prend pas pour une quantité le nom d'une carte qui commence par « x »", () => {
    const parsed = parseTradeText("X marque l'endroit (OGN)");

    assert.deepEqual(parsed.lines, [{ quantity: 1, name: "X marque l'endroit", setCode: "OGN" }]);
  });

  it("fond deux lignes qui désignent la même impression", () => {
    const parsed = parseTradeText("1 Éclat de Faille (OGN) 12\n2 eclat de faille (ogn) 12");

    assert.deepEqual(parsed.lines, [
      { quantity: 3, name: "Éclat de Faille", setCode: "OGN", collectorNumber: "12" },
    ]);
  });

  it("distingue deux impressions d'une même carte", () => {
    const parsed = parseTradeText("1 Éclat de Faille (OGN) 12\n1 Éclat de Faille (OGN) 200");

    assert.equal(parsed.lines.length, 2);
  });

  it("borne une quantité extravagante", () => {
    const parsed = parseTradeText("500 Éclat de Faille (OGN)");

    assert.equal(parsed.lines[0].quantity, 99);
  });

  it("écarte une ligne sans carte", () => {
    const parsed = parseTradeText("0 Éclat de Faille (OGN)");

    assert.deepEqual(parsed.lines, []);
    assert.deepEqual(parsed.ignored, ["0 Éclat de Faille (OGN)"]);
  });
});

describe("stringifyTradeCards", () => {
  it("écrit ce que la lecture reprend à l'identique", () => {
    const cards = [
      { name: "Voix de la Faille", setCode: "OGN", collectorNumber: "123", quantity: 2 },
      { name: "Éclat de Faille", setCode: "DUN", collectorNumber: "7", quantity: 1 },
    ];

    const text = stringifyTradeCards(cards);
    assert.equal(text, "2 Voix de la Faille (OGN) 123\n1 Éclat de Faille (DUN) 7");
    assert.deepEqual(
      parseTradeText(text).lines,
      cards.map((card) => ({
        quantity: card.quantity,
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
      }))
    );
  });

  it("tait le numéro d'une carte qui n'en porte pas", () => {
    assert.equal(
      stringifyTradeCards([{ name: "Verrou runique", setCode: "OGN", collectorNumber: "", quantity: 1 }]),
      "1 Verrou runique (OGN)"
    );
  });
});

describe("applyTradeText", () => {
  const catalog = new Map([
    ["voix de la faille", { key: "Voix de la Faille|OGN|123" }],
    ["éclat de faille", { key: "Éclat de Faille|OGN|12" }],
  ]);
  const resolve = (line: { name: string }) => catalog.get(line.name.toLowerCase());

  it("apparie les lignes et signale celles qu'aucune carte ne satisfait", () => {
    const parsed = parseTradeText("2 Voix de la Faille (OGN) 123\n1 Carte inventée (ZZZ)");
    const applied = applyTradeText(parsed.lines, resolve);

    assert.deepEqual(applied.entries, [{ card: { key: "Voix de la Faille|OGN|123" }, quantity: 2 }]);
    assert.deepEqual(applied.unmatched, ["1 Carte inventée (ZZZ)"]);
    assert.equal(applied.dropped, 0);
  });

  it("fusionne deux lignes appariées à la même impression", () => {
    const parsed = parseTradeText("1 Voix de la Faille (OGN) 123\n2 Voix de la Faille");
    const applied = applyTradeText(parsed.lines, resolve);

    assert.deepEqual(applied.entries, [{ card: { key: "Voix de la Faille|OGN|123" }, quantity: 3 }]);
  });

  it("laisse dehors ce qui dépasse la taille d'une face", () => {
    const parsed = parseTradeText("1 Voix de la Faille (OGN) 123\n1 Éclat de Faille (OGN) 12");
    const applied = applyTradeText(parsed.lines, resolve, 1);

    assert.equal(applied.entries.length, 1);
    assert.equal(applied.dropped, 1);
  });
});
