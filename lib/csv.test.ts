import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, parseCsvRows, toCsv } from "@/lib/csv";

/**
 * Tests du CSV. Les fichiers traités viennent d'outils tiers : c'est
 * précisément là qu'un guillemet ou une virgule dans un nom de carte casse un
 * découpage naïf, sans que rien ne le signale avant l'import de travers.
 *
 * Exécution : `npm run test`.
 */

describe("toCsv", () => {
  it("n'entoure de guillemets que ce qui en a besoin", () => {
    const csv = toCsv(["a", "b"], [{ a: "simple", b: "avec, virgule" }]);
    assert.equal(csv, 'a,b\r\nsimple,"avec, virgule"\r\n');
  });

  it("double les guillemets d'une valeur", () => {
    const csv = toCsv(["a"], [{ a: 'dit "bonjour"' }]);
    assert.equal(csv, 'a\r\n"dit ""bonjour"""\r\n');
  });

  it("rend une cellule vide pour une clé absente", () => {
    const csv = toCsv(["a", "b"], [{ a: "x" }]);
    assert.equal(csv, "a,b\r\nx,\r\n");
  });

  it("préserve un retour à la ligne dans une valeur", () => {
    const csv = toCsv(["note"], [{ note: "ligne1\nligne2" }]);
    assert.deepEqual(parseCsvRows(csv), [["note"], ["ligne1\nligne2"]]);
  });
});

describe("parseCsvRows", () => {
  it("lit des lignes séparées en CRLF comme en LF", () => {
    assert.deepEqual(parseCsvRows("a,b\r\n1,2\n3,4\r\n"), [
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("rend une valeur entre guillemets contenant virgule et saut de ligne", () => {
    assert.deepEqual(parseCsvRows('a\r\n"x,y\nz"\r\n'), [["a"], ["x,y\nz"]]);
  });

  it("ignore les lignes vides", () => {
    assert.deepEqual(parseCsvRows("a\r\n\r\n1\r\n\r\n"), [["a"], ["1"]]);
  });

  it("retire le BOM d'un fichier produit par un tableur", () => {
    assert.deepEqual(parseCsvRows("﻿Card Name\r\nAnnie\r\n"), [["Card Name"], ["Annie"]]);
  });

  it("garde un guillemet en milieu de valeur non entourée", () => {
    assert.deepEqual(parseCsvRows('a\r\n12" pouces\r\n'), [["a"], ['12" pouces']]);
  });
});

describe("parseCsv", () => {
  it("indexe les cellules par en-tête et détoure les valeurs", () => {
    const table = parseCsv("Card Name , Quantity \r\n Annie , 2 \r\n");
    assert.deepEqual(table.headers, ["Card Name", "Quantity"]);
    assert.deepEqual(table.rows, [{ "Card Name": "Annie", Quantity: "2" }]);
  });

  it("situe chaque ligne dans le fichier, en-tête comprise", () => {
    const table = parseCsv("a\r\n1\r\n2\r\n");
    assert.deepEqual(table.lineNumbers, [2, 3]);
  });

  it("complète les cellules manquantes d'une ligne trop courte", () => {
    const table = parseCsv("a,b,c\r\n1,2\r\n");
    assert.deepEqual(table.rows, [{ a: "1", b: "2", c: "" }]);
  });

  it("rend une table vide pour une entrée vide", () => {
    assert.deepEqual(parseCsv(""), { headers: [], rows: [], lineNumbers: [] });
  });

  it("relit ce que `toCsv` a écrit", () => {
    const rows = [{ name: 'Ashe, "the" Frost', note: "ligne1\nligne2" }];
    const table = parseCsv(toCsv(["name", "note"], rows));
    assert.deepEqual(table.rows, rows);
  });
});
