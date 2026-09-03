import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_POSTER_LAIRS, posterVenue, readGameKeys, readLairIds } from "./selection.ts";

const ID = (suffix: string) => `652f00000000000000000${suffix}`;

const STRINGS = {
  venues: (count: number) => `${count} lieux`,
  more: (count: number) => `+${count}`,
};

describe("readLairIds", () => {
  it("lit les identifiants d'un paramètre, dans l'ordre demandé", () => {
    assert.deepEqual(readLairIds(`${ID("001")},${ID("002")}`), [ID("001"), ID("002")]);
  });

  it("écarte ce qui n'est pas un identifiant Mongo", () => {
    // `new ObjectId("bonjour")` lève : laisser passer une adresse bricolée
    // rendrait 500 là où la bonne réponse est de n'en rien faire.
    assert.deepEqual(readLairIds("bonjour,../../etc,652f"), []);
    assert.deepEqual(readLairIds(`bonjour,${ID("003")}`), [ID("003")]);
  });

  it("rend une liste vide sans paramètre", () => {
    assert.deepEqual(readLairIds(undefined), []);
    assert.deepEqual(readLairIds(""), []);
  });

  it("ne garde qu'une fois le même lieu, quelle que soit sa casse", () => {
    assert.deepEqual(readLairIds(`${ID("00a")},${ID("00A")}`), [ID("00a")]);
  });

  it("plafonne la sélection : une A4 ne tient pas la semaine de vingt boutiques", () => {
    const many = Array.from({ length: 20 }, (_, index) => ID(String(index).padStart(3, "0"))).join(",");

    assert.equal(readLairIds(many).length, MAX_POSTER_LAIRS);
    assert.equal(readLairIds(many, 3).length, 3);
  });
});

describe("readGameKeys", () => {
  it("accepte un identifiant comme une limace", () => {
    assert.deepEqual(readGameKeys("riftbound,652f0000000000000000000a"), ["riftbound", "652f0000000000000000000a"]);
  });

  it("écarte ce qui n'a pas la forme d'une clé d'URL", () => {
    assert.deepEqual(readGameKeys("magic the gathering,../secret,<script>"), []);
    assert.deepEqual(readGameKeys(`${"x".repeat(81)},lorcana`), ["lorcana"]);
  });

  it("rend une liste vide sans paramètre — l'affiche montre alors tous les jeux", () => {
    assert.deepEqual(readGameKeys(undefined), []);
  });
});

describe("posterVenue", () => {
  it("présente un lieu unique comme sa propre affiche le ferait", () => {
    const venue = posterVenue([{ name: "La Taverne", address: "12 rue des Dés" }], STRINGS);

    assert.deepEqual(venue, { name: "La Taverne", address: "12 rue des Dés" });
  });

  it("compte les lieux en titre, et les nomme sous lui", () => {
    const venue = posterVenue([{ name: "La Taverne" }, { name: "Le Repaire" }], STRINGS);

    assert.equal(venue.name, "2 lieux");
    assert.equal(venue.address, "La Taverne · Le Repaire");
  });

  it("passé trois noms, garde trois noms et compte le reste", () => {
    const venue = posterVenue(
      [{ name: "Un" }, { name: "Deux" }, { name: "Trois" }, { name: "Quatre" }, { name: "Cinq" }],
      STRINGS,
    );

    assert.equal(venue.name, "5 lieux");
    assert.equal(venue.address, "Un · Deux · Trois · +2");
  });

  it("n'écrit pas d'adresse pour un lieu qui n'en a pas", () => {
    assert.equal(posterVenue([{ name: "La Taverne" }], STRINGS).address, undefined);
  });
});
