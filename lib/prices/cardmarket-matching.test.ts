import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CardmarketProduct } from "./cardmarket";
import {
  CARDMARKET_GAME_PROFILES,
  compareCollectorNumbers,
  inferExpansionMappings,
  matchCardmarketProducts,
  normalizeCardName,
  type PriceableCard,
} from "./cardmarket-matching";

/**
 * Rapprochement des produits Cardmarket et des cartes de la plateforme : les
 * deux catalogues n'ont aucun identifiant commun, tout repose sur le nom et
 * sur la correspondance déduite entre extensions.
 *
 * Exécution : `npm run test`.
 */

const fab = CARDMARKET_GAME_PROFILES.fab;

let nextProductId = 600000;

function product(name: string, idExpansion: number): CardmarketProduct {
  return {
    idProduct: nextProductId++,
    name,
    idCategory: 1601,
    categoryName: "Flesh And Blood Single",
    idExpansion,
    idMetacard: 400000,
    dateAdded: "2021-12-31 00:00:00",
  };
}

function card(id: string, name: string, setCode: string, pitch?: number): PriceableCard {
  // Le numéro de collection est celui que porte l'identifiant (`OGN027a`).
  return { id, name, setCode, collectorNumber: id.replace(/^[A-Z]+/, ""), ...(pitch === undefined ? {} : { pitch }) };
}

describe("normalizeCardName", () => {
  it("ignore casse, accents et ponctuation", () => {
    assert.equal(normalizeCardName("Ira, Crimson Haze"), normalizeCardName("ira crimson haze"));
    assert.equal(normalizeCardName("Riches of Trōpal-Dhani"), "richesoftropaldhani");
  });
});

describe("profil Flesh and Blood", () => {
  it("lit la couleur de pitch écrite par Cardmarket", () => {
    assert.equal(fab.productKey("Savage Swing (Red)"), fab.cardKey(card("WTR020", "Savage Swing", "WTR", 1)));
    assert.equal(fab.productKey("Savage Swing (Blue)"), fab.cardKey(card("WTR022", "Savage Swing", "WTR", 3)));
  });

  it("distingue les trois pitchs d'une même carte", () => {
    assert.notEqual(fab.productKey("Savage Swing (Red)"), fab.productKey("Savage Swing (Yellow)"));
  });

  it("tolère les fautes de frappe du catalogue de Cardmarket", () => {
    assert.equal(fab.productKey("Savage Swing (Yelllow)"), fab.productKey("Savage Swing (Yellow)"));
  });

  it("rapproche les cartes sans pitch, héros et équipements", () => {
    assert.equal(fab.productKey("Ira, Crimson Haze"), fab.cardKey(card("WTR001", "Ira, Crimson Haze", "WTR")));
  });

  it("garde une parenthèse qui n'est pas une couleur dans le nom", () => {
    assert.notEqual(fab.productKey("Savage Swing (Pink)"), fab.productKey("Savage Swing"));
  });
});

describe("compareCollectorNumbers", () => {
  const sorted = (numbers: string[]) => [...numbers].sort(compareCollectorNumbers);

  it("classe les numéros dans l'ordre du jeu, pas dans celui des chaînes", () => {
    assert.deepEqual(sorted(["10", "9", "100"]), ["9", "10", "100"]);
    assert.deepEqual(sorted(["027", "9"]), ["9", "027"]);
  });

  it("place une variante après le numéro dont elle est tirée", () => {
    assert.deepEqual(sorted(["027b", "027a", "027", "028"]), ["027", "027a", "027b", "028"]);
  });
});

describe("profil au nom seul", () => {
  const swu = CARDMARKET_GAME_PROFILES.swu;

  it("rapproche le nom complet, sous-titre compris", () => {
    assert.equal(
      swu.productKey("Darth Vader, Dark Lord of the Sith"),
      swu.cardKey(card("SOR-10", "Darth Vader, Dark Lord of the Sith", "SOR"))
    );
  });
});

describe("inferExpansionMappings", () => {
  const cards = [
    card("WTR020", "Savage Swing", "WTR", 1),
    card("WTR021", "Savage Swing", "WTR", 2),
    card("WTR100", "Alpha Rampage", "WTR", 1),
    card("ARC001", "Eye of Ophidia", "ARC"),
    card("ARC002", "Bloodrush Bellow", "ARC", 1),
  ];

  it("reconnaît une extension à ses noms de cartes", () => {
    const mappings = inferExpansionMappings(
      [product("Savage Swing (Red)", 4477), product("Savage Swing (Yellow)", 4477), product("Alpha Rampage (Red)", 4477)],
      cards,
      fab
    );

    assert.deepEqual(mappings.map((mapping) => mapping.setCodes[0]?.setCode), ["WTR"]);
  });

  it("reconnaît la même extension derrière deux extensions Cardmarket", () => {
    const mappings = inferExpansionMappings(
      [
        product("Savage Swing (Red)", 4477),
        product("Alpha Rampage (Red)", 4477),
        product("Savage Swing (Red)", 4479),
        product("Alpha Rampage (Red)", 4479),
      ],
      cards,
      fab
    );

    assert.deepEqual(
      mappings.map((mapping) => [mapping.idExpansion, mapping.setCodes[0]?.setCode]),
      [[4477, "WTR"], [4479, "WTR"]]
    );
  });

  it("préfère l'extension dont la taille correspond", () => {
    // Une carte partagée ne suffit pas à faire d'une extension complète la
    // meilleure candidate face à l'extension qui n'a que cette carte.
    const mappings = inferExpansionMappings(
      [product("Eye of Ophidia", 4480)],
      [...cards, card("PROMO1", "Eye of Ophidia", "LGS")],
      fab
    );

    assert.equal(mappings[0].setCodes[0].setCode, "LGS");
  });

  it("ne reconnaît rien derrière une extension sans carte commune", () => {
    const mappings = inferExpansionMappings([product("Carte inconnue", 9999)], cards, fab);

    assert.deepEqual(mappings[0].setCodes, []);
  });
});

describe("matchCardmarketProducts", () => {
  const cards = [
    card("WTR020", "Savage Swing", "WTR", 1),
    card("WTR100", "Alpha Rampage", "WTR", 1),
    card("WTR101", "Bloodrush Bellow", "WTR", 1),
    card("LGS044", "Savage Swing", "LGS", 1),
    card("LGS045", "Ray of Hope", "LGS", 1),
    card("LGS046", "Eclipse Existence", "LGS", 1),
  ];

  it("rapproche chaque produit de la carte de son extension", () => {
    const wtr = [
      product("Savage Swing (Red)", 4477),
      product("Alpha Rampage (Red)", 4477),
      product("Bloodrush Bellow (Red)", 4477),
    ];
    const lgs = [
      product("Savage Swing (Red)", 4501),
      product("Ray of Hope (Red)", 4501),
      product("Eclipse Existence (Red)", 4501),
    ];

    const { matches } = matchCardmarketProducts([...wtr, ...lgs], cards, fab);

    assert.deepEqual(matches.get("WTR020")?.map((match) => match.idProduct), [wtr[0].idProduct]);
    assert.deepEqual(matches.get("LGS044")?.map((match) => match.idProduct), [lgs[0].idProduct]);
  });

  it("garde tous les tirages d'un même numéro", () => {
    // Cardmarket vend le tirage normal et sa version foil comme deux produits
    // de même nom, dans la même extension.
    const products = [
      product("Savage Swing (Red)", 4477),
      product("Savage Swing (Red)", 4477),
      product("Alpha Rampage (Red)", 4477),
      product("Bloodrush Bellow (Red)", 4477),
    ];

    const { matches } = matchCardmarketProducts(products, cards, fab);

    assert.equal(matches.get("WTR020")?.length, 2);
  });

  it("écarte un produit dont aucune carte ne porte le nom", () => {
    const products = [
      product("Savage Swing (Red)", 4477),
      product("Alpha Rampage (Red)", 4477),
      product("Bloodrush Bellow (Red)", 4477),
      product("Carte inconnue (Red)", 4477),
    ];

    const { matches, skipped } = matchCardmarketProducts(products, cards, fab);

    assert.equal(skipped.unknownCard, 1);
    assert.equal(matches.size, 3);
  });

  it("écarte un produit dont l'extension n'est pas reconnue", () => {
    // Une seule carte en commun avec une grande extension ne la reconnaît
    // pas : c'est une réimpression promotionnelle, pas la même extension.
    const bigSet = Array.from({ length: 40 }, (_, index) =>
      card(`WTR${String(index).padStart(3, "0")}`, `Carte ${index}`, "WTR", 1)
    );

    const { matches, skipped } = matchCardmarketProducts(
      [product("Savage Swing (Red)", 9999)],
      [...bigSet, card("WTR020", "Savage Swing", "WTR", 1)],
      fab
    );

    assert.equal(skipped.unmappedExpansion, 1);
    assert.equal(matches.size, 0);
  });

  it("apparie les variantes d'un même nom dans l'ordre des numéros", () => {
    // Une carte et sa version showcase portent le même nom des deux côtés :
    // seul l'ordre les distingue, Cardmarket numérotant ses produits dans
    // l'ordre des numéros de collection.
    const riftbound = CARDMARKET_GAME_PROFILES.riftbound;
    const ogn = [
      card("OGN027", "Darius, Trifarian", "OGN"),
      card("OGN027a", "Darius, Trifarian", "OGN"),
      card("OGN028", "Braum, Heart of the Freljord", "OGN"),
      card("OGN029", "Zed, From the Shadows", "OGN"),
    ];
    const showcase = product("Darius, Trifarian", 6286);
    const base = { ...product("Darius, Trifarian", 6286), idProduct: showcase.idProduct - 1 };
    const products = [showcase, base, product("Braum, Heart of the Freljord", 6286), product("Zed, From the Shadows", 6286)];

    const { matches, paired } = matchCardmarketProducts(products, ogn, riftbound);

    assert.equal(paired, 2);
    assert.deepEqual(matches.get("OGN027")?.map((match) => match.idProduct), [base.idProduct]);
    assert.deepEqual(matches.get("OGN027a")?.map((match) => match.idProduct), [showcase.idProduct]);
  });

  it("n'apparie pas s'il manque un produit à une variante", () => {
    // Trois numéros pour deux produits : les apparier dans l'ordre en
    // décalerait un, et rien ne dit lequel Cardmarket ne vend pas.
    const riftbound = CARDMARKET_GAME_PROFILES.riftbound;
    const ogn = [
      card("OGN027", "Darius, Trifarian", "OGN"),
      card("OGN027a", "Darius, Trifarian", "OGN"),
      card("OGN027b", "Darius, Trifarian", "OGN"),
      card("OGN028", "Braum, Heart of the Freljord", "OGN"),
    ];
    const products = [
      product("Darius, Trifarian", 6286),
      product("Darius, Trifarian", 6286),
      product("Braum, Heart of the Freljord", 6286),
    ];

    const { matches, paired, skipped } = matchCardmarketProducts(products, ogn, riftbound);

    assert.equal(paired, 0);
    assert.equal(skipped.ambiguous, 2);
    assert.deepEqual([...matches.keys()], ["OGN028"]);
  });

  it("n'apparie pas dans une extension à peine reconnue", () => {
    // Deux produits promotionnels face à une extension complète : l'ordre des
    // identifiants Cardmarket n'y suit plus celui des numéros.
    const riftbound = CARDMARKET_GAME_PROFILES.riftbound;
    const set = [
      card("OGN027", "Darius, Trifarian", "OGN"),
      card("OGN027a", "Darius, Trifarian", "OGN"),
      ...Array.from({ length: 8 }, (_, index) => card(`OGN10${index}`, `Carte ${index}`, "OGN")),
    ];
    const products = [product("Darius, Trifarian", 6480), product("Darius, Trifarian", 6480)];

    const { matches, paired, skipped } = matchCardmarketProducts(products, set, riftbound);

    assert.equal(paired, 0);
    assert.equal(skipped.ambiguous, 2);
    assert.equal(matches.size, 0);
  });

  it("n'attribue pas de prix quand deux cartes sont aussi plausibles", () => {
    // Deux numéros de même nom dans la même extension : rien ne dit lequel
    // Cardmarket vend, et se tromper daterait un prix sur la mauvaise carte.
    const ambiguous = [
      card("PEN001", "Savage Claw", "PEN", 1),
      card("PEN002", "Savage Claw", "PEN", 1),
      card("PEN003", "Cracked Bauble", "PEN"),
    ];
    const products = [product("Savage Claw (Red)", 6396), product("Cracked Bauble", 6396)];

    const { matches, skipped } = matchCardmarketProducts(products, ambiguous, fab);

    assert.equal(skipped.ambiguous, 1);
    assert.deepEqual([...matches.keys()], ["PEN003"]);
  });
});
