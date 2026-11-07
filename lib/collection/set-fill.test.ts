import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/collection/formats/types";
import { gameSetCards, planSetFill, setPrintings, type OwnedCounts } from "@/lib/collection/set-fill";

/**
 * Ajout rapide d'une extension : un ajout de travers écrit des centaines
 * d'exemplaires d'un coup. Chaque règle est donc vérifiée.
 *
 * Exécution : `npm run test`.
 */

function card(id: string, name: string, collectorNumber: string, rarity: string, setCode = "OGN"): CatalogCard {
  return { id, name, setCode, collectorNumber, rarity, image: "" };
}

const CATALOG: CatalogCard[] = [
  card("OGN001", "Blazing Scorcher", "001", "Common"),
  // Le catalogue porte une ligne par langue : même tirage, deux lignes.
  card("OGN001", "Blazing Scorcher", "001", "Common"),
  card("OGN002", "Brazen Buccaneer", "002", "Rare"),
  card("OGN202", "Jinx, Demolitionist", "202", "Epic"),
  card("OGN202a", "Jinx, Demolitionist", "202a", "Showcase"),
  card("SFD010", "Other Set", "010", "Common", "SFD"),
];

const PRINTINGS = setPrintings(CATALOG, "ogn");

describe("ajout rapide d'une extension", () => {
  it("prend un tirage par numéro, de la bonne extension", () => {
    assert.deepEqual(
      PRINTINGS.map((entry) => entry.collectorNumber),
      ["001", "002", "202", "202a"]
    );
  });

  it("garde la version de base de chaque carte dans le set de jeu", () => {
    assert.deepEqual(
      gameSetCards(PRINTINGS).map((entry) => entry.collectorNumber),
      ["001", "002", "202"]
    );
  });

  it("ajoute N exemplaires à chaque carte par défaut, quoi qu'on possède", () => {
    const owned: OwnedCounts = { byPrinting: new Map([["OGN|1", 5]]), byName: new Map([["blazing scorcher", 5]]) };
    const plan = planSetFill(PRINTINGS, { copies: 2, mode: "add", scope: "game" }, owned);
    assert.equal(plan.copies, 6);
    assert.equal(plan.unchanged, 0);
  });

  it("complète jusqu'à N en comptant tous les tirages du même nom dans le set de jeu", () => {
    const owned: OwnedCounts = {
      byPrinting: new Map([["OGN|202A", 2]]),
      byName: new Map([["jinx, demolitionist", 2], ["brazen buccaneer", 4]]),
    };
    const plan = planSetFill(PRINTINGS, { copies: 3, mode: "fill", scope: "game" }, owned);
    assert.deepEqual(
      plan.entries.map((entry) => [entry.card.collectorNumber, entry.quantity]),
      [["001", 3], ["202", 1]]
    );
    assert.equal(plan.unchanged, 1);
  });

  it("complète tirage par tirage dans le set maître", () => {
    const owned: OwnedCounts = { byPrinting: new Map([["OGN|202A", 2]]), byName: new Map([["jinx, demolitionist", 2]]) };
    const plan = planSetFill(PRINTINGS, { copies: 3, mode: "fill", scope: "master" }, owned);
    assert.deepEqual(
      plan.entries.map((entry) => [entry.card.collectorNumber, entry.quantity]),
      [["001", 3], ["002", 3], ["202", 3], ["202a", 1]]
    );
  });

  it("ne garde que les raretés cochées", () => {
    const plan = planSetFill(PRINTINGS, { copies: 1, mode: "add", scope: "master", rarities: ["Showcase", "Epic"] });
    assert.deepEqual(plan.entries.map((entry) => entry.card.collectorNumber), ["202", "202a"]);
    assert.equal(plan.cards, 2);
  });

  it("plafonne le nombre d'exemplaires par carte", () => {
    const plan = planSetFill(PRINTINGS, { copies: 500, mode: "add", scope: "game" });
    assert.equal(plan.entries[0].quantity, 20);
  });
});
