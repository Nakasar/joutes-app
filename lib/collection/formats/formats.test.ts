import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv } from "@/lib/csv";
import {
  collectionFormatsForGame,
  findCollectionFormat,
  type CatalogCard,
  type CollectionEntryGroup,
  type FormatContext,
} from "@/lib/collection/formats";
import { joutesFormat } from "@/lib/collection/formats/joutes";
import { parseVariantNumber, piltoverFormat } from "@/lib/collection/formats/piltover";

/**
 * Tests des formats de collection. Un import de travers ajoute silencieusement
 * de mauvaises cartes à la collection de quelqu'un : chaque règle de
 * correspondance — numéro complété de zéros, suffixe foil, nom ambigu — est
 * donc vérifiée plutôt que supposée.
 *
 * Exécution : `npm run test`.
 */

function card(overrides: Partial<CatalogCard> & Pick<CatalogCard, "id">): CatalogCard {
  return {
    name: "Blazing Scorcher",
    setCode: "OGN",
    collectorNumber: "001",
    image: "https://example.test/card.png",
    rarity: "Common",
    ...overrides,
  };
}

const CATALOG: CatalogCard[] = [
  card({ id: "OGN001" }),
  card({ id: "OGN002", name: "Brazen Buccaneer", collectorNumber: "002" }),
  card({
    id: "SFD125",
    name: "Blazing Scorcher",
    setCode: "SFD",
    collectorNumber: "125",
    rarity: "Rare",
    printings: [{ id: "promo-pack", name: "Promo Pack" }],
  }),
  card({ id: "UNL010", name: "Solo Foil", setCode: "UNL", collectorNumber: "010", foil: true }),
];

const CONTEXT: FormatContext = {
  gameSlug: "riftbound",
  catalog: CATALOG,
  setNames: { OGN: "Origins", SFD: "Spiritforged", UNL: "Unleashed" },
};

function group(overrides: Partial<CollectionEntryGroup> = {}): CollectionEntryGroup {
  return {
    cardId: "OGN001",
    name: "Blazing Scorcher",
    setCode: "OGN",
    collectorNumber: "001",
    rarity: "Common",
    foil: false,
    quantity: 2,
    ...overrides,
  };
}

describe("registre des formats", () => {
  it("propose Joutes à tous les jeux et Piltover au seul Riftbound", () => {
    assert.deepEqual(
      collectionFormatsForGame("riftbound").map((format) => format.id),
      ["joutes", "piltover-archive"],
    );
    assert.deepEqual(
      collectionFormatsForGame("swu").map((format) => format.id),
      ["joutes"],
    );
  });

  it("refuse un format qui ne s'applique pas au jeu demandé", () => {
    assert.equal(findCollectionFormat("piltover-archive", "swu"), undefined);
    assert.ok(findCollectionFormat("piltover-archive", "riftbound"));
  });
});

describe("format Joutes", () => {
  it("fait l'aller-retour sans rien perdre", () => {
    const original = group({
      printingId: "promo-pack",
      printingName: "Promo Pack",
      cardId: "SFD125",
      setCode: "SFD",
      collectorNumber: "125",
      foil: true,
      language: "FR",
      condition: "Near Mint",
      grade: 9.5,
      obtainedAt: "2026-01-15",
      acquisitionPrice: 12.5,
      acquisitionCurrency: "EUR",
      quantity: 3,
    });

    const { entries, issues } = joutesFormat.fromCsv(joutesFormat.toCsv([original], CONTEXT), CONTEXT);

    assert.deepEqual(issues, []);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].card.id, "SFD125");
    assert.equal(entries[0].quantity, 3);
    assert.equal(entries[0].foil, true);
    assert.equal(entries[0].printingId, "promo-pack");
    assert.equal(entries[0].language, "FR");
    assert.equal(entries[0].condition, "Near Mint");
    assert.equal(entries[0].grade, 9.5);
    assert.equal(entries[0].obtainedAt, "2026-01-15");
    assert.equal(entries[0].acquisitionPrice, 12.5);
    assert.equal(entries[0].acquisitionCurrency, "EUR");
  });

  it("retrouve une carte par extension et numéro quand l'identifiant est absent", () => {
    const csv = "Card ID,Name,Set Code,Collector Number,Quantity\r\n,,OGN,1,4\r\n";
    const { entries, issues } = joutesFormat.fromCsv(csv, CONTEXT);

    assert.deepEqual(issues, []);
    assert.equal(entries[0].card.id, "OGN001");
    assert.equal(entries[0].quantity, 4);
  });

  it("signale un nom porté par plusieurs cartes sans l'importer", () => {
    const csv = "Card ID,Name,Set Code,Collector Number,Quantity\r\n,Blazing Scorcher,,,1\r\n";
    const { entries, issues } = joutesFormat.fromCsv(csv, CONTEXT);

    assert.equal(entries.length, 0);
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /Plusieurs cartes/);
    assert.equal(issues[0].line, 2);
  });

  it("signale une carte inconnue et importe quand même les autres lignes", () => {
    const csv =
      "Card ID,Name,Set Code,Collector Number,Quantity\r\n" +
      "ZZZ999,Carte fantôme,ZZZ,999,1\r\n" +
      "OGN002,Brazen Buccaneer,OGN,002,2\r\n";
    const { entries, issues } = joutesFormat.fromCsv(csv, CONTEXT);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].card.id, "OGN002");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].line, 2);
  });

  it("écarte une quantité invalide", () => {
    const csv = "Card ID,Quantity\r\nOGN001,0\r\nOGN001,abc\r\nOGN001,1000\r\n";
    const { entries, issues } = joutesFormat.fromCsv(csv, CONTEXT);

    assert.equal(entries.length, 0);
    assert.equal(issues.length, 3);
  });

  it("compte une ligne sans quantité pour un exemplaire", () => {
    const { entries } = joutesFormat.fromCsv("Card ID,Quantity\r\nOGN001,\r\n", CONTEXT);
    assert.equal(entries[0].quantity, 1);
  });

  it("impose le foil d'une carte qui n'existe qu'en foil", () => {
    const { entries } = joutesFormat.fromCsv("Card ID,Foil,Quantity\r\nUNL010,false,1\r\n", CONTEXT);
    assert.equal(entries[0].foil, true);
  });

  it("ignore une langue ou un état que le schéma ne connaît pas", () => {
    const csv = "Card ID,Language,Condition,Quantity\r\nOGN001,Klingon,Bof,1\r\n";
    const { entries, issues } = joutesFormat.fromCsv(csv, CONTEXT);

    assert.deepEqual(issues, []);
    assert.equal(entries[0].language, undefined);
    assert.equal(entries[0].condition, undefined);
  });
});

describe("parseVariantNumber", () => {
  it("sépare l'extension du numéro", () => {
    assert.deepEqual(parseVariantNumber("OGN-001"), {
      setCode: "OGN",
      collectorNumber: "001",
      foil: false,
    });
  });

  it("reconnaît le suffixe foil sans l'avaler dans le numéro", () => {
    assert.deepEqual(parseVariantNumber("OGN-001-Foil"), {
      setCode: "OGN",
      collectorNumber: "001",
      foil: true,
    });
  });

  it("garde un numéro composé et n'en coupe que le dernier tiret", () => {
    assert.deepEqual(parseVariantNumber("OGN-SP-012"), {
      setCode: "OGN-SP",
      collectorNumber: "012",
      foil: false,
    });
  });
});

describe("format Piltover Archive", () => {
  it("écrit les colonnes attendues par Piltover", () => {
    const csv = piltoverFormat.toCsv([group({ foil: true, language: "EN", condition: "Near Mint" })], CONTEXT);
    const table = parseCsv(csv);

    assert.deepEqual(table.headers[0], "Variant Number");
    assert.deepEqual(table.rows[0], {
      "Variant Number": "OGN-001-Foil",
      "Card Name": "Blazing Scorcher",
      Set: "Origins",
      "Set Prefix": "OGN",
      Rarity: "Common",
      "Variant Type": "Standard",
      "Variant Label": "Foil",
      Foil: "true",
      Quantity: "2",
      Language: "English",
      Condition: "Near Mint",
      "Grading Company": "",
      "Grading Value": "",
      "Grading Label": "",
      Notes: "",
    });
  });

  it("relit le fichier d'exemple de Piltover", () => {
    const csv =
      "Variant Number,Card Name,Set,Set Prefix,Rarity,Variant Type,Variant Label,Foil,Quantity,Language,Condition,Grading Company,Grading Value,Grading Label,Notes\r\n" +
      "OGN-001,Blazing Scorcher,Origins,OGN,Common,Standard,Standard,false,2,English,Near Mint,,,,\r\n" +
      "OGN-001-Foil,Blazing Scorcher,Origins,OGN,Common,Standard,Foil,true,1,English,Near Mint,,,,\r\n";
    const { entries, issues } = piltoverFormat.fromCsv(csv, CONTEXT);

    assert.deepEqual(issues, []);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].card.id, "OGN001");
    assert.equal(entries[0].quantity, 2);
    assert.equal(entries[0].foil, false);
    assert.equal(entries[0].language, "EN");
    assert.equal(entries[0].condition, "Near Mint");
    assert.equal(entries[1].foil, true);
  });

  it("garde les lignes répétées d'une même carte comme autant de lots", () => {
    const csv =
      "Variant Number,Card Name,Set Prefix,Quantity\r\n" +
      "OGN-002,Brazen Buccaneer,OGN,3\r\n" +
      "OGN-002,Brazen Buccaneer,OGN,1\r\n";
    const { entries } = piltoverFormat.fromCsv(csv, CONTEXT);

    assert.deepEqual(
      entries.map((entry) => entry.quantity),
      [3, 1],
    );
  });

  it("fait confiance à la colonne Foil plutôt qu'au suffixe du numéro", () => {
    const csv = "Variant Number,Set Prefix,Foil,Quantity\r\nOGN-001-Foil,OGN,false,1\r\n";
    const { entries } = piltoverFormat.fromCsv(csv, CONTEXT);
    assert.equal(entries[0].foil, false);
  });

  it("reprend la note de gradation, et ignore une note hors barème", () => {
    const graded = piltoverFormat.fromCsv(
      "Variant Number,Set Prefix,Grading Value,Quantity\r\nOGN-001,OGN,9.5,1\r\n",
      CONTEXT,
    );
    assert.equal(graded.entries[0].grade, 9.5);

    const invalid = piltoverFormat.fromCsv(
      "Variant Number,Set Prefix,Grading Value,Quantity\r\nOGN-001,OGN,42,1\r\n",
      CONTEXT,
    );
    assert.equal(invalid.entries[0].grade, undefined);
  });

  it("retrouve un numéro non complété de zéros", () => {
    const { entries, issues } = piltoverFormat.fromCsv(
      "Variant Number,Set Prefix,Quantity\r\nOGN-1,OGN,1\r\n",
      CONTEXT,
    );
    assert.deepEqual(issues, []);
    assert.equal(entries[0].card.id, "OGN001");
  });
});
