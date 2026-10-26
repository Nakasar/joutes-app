import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyDeckText,
  keptDeckCards,
  mergeDeckText,
  normalizeCardName,
  parseDeckText,
  renameDeckTextCard,
  stringifyDeckText,
} from "@/lib/decks/text";
import { getDeckZones } from "@/lib/decks/zones";
import type { DeckCards } from "@/lib/decks/contents";

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
      { zone: "maindeck", name: "Éclat de Faille", quantity: 3, inferred: true },
      { zone: "maindeck", name: "Marcheur des Dunes", quantity: 1, inferred: true },
    ]);
  });

  it("fusionne deux lignes qui nomment la même carte", () => {
    const parsed = parseDeckText("2 Éclat de Faille\n1 Éclat de Faille", riftbound);

    assert.deepEqual(parsed.lines, [{ zone: "maindeck", name: "Éclat de Faille", quantity: 3, inferred: true }]);
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

  it("range par type les lignes sans en-tête, exemplaire par exemplaire", () => {
    const parsed = parseDeckText("1 Loose Cannon\n3 Jinx\nRunes:\n12 Fury Rune", riftbound);
    const ids: Record<string, string> = { "Loose Cannon": "l1", Jinx: "c1", "Fury Rune": "r1" };
    const route = (cardId: string, cards: DeckCards) =>
      cardId === "l1" ? "legend" : cardId === "c1" && !cards.champions?.length ? "champions" : "maindeck";

    const applied = applyDeckText(parsed, (name) => ids[name], route);

    assert.deepEqual(applied.cards.legend, [{ cardId: "l1", quantity: 1 }]);
    assert.deepEqual(applied.cards.champions, [{ cardId: "c1", quantity: 1 }]);
    assert.deepEqual(applied.cards.maindeck, [{ cardId: "c1", quantity: 2 }]);
    // Une ligne sous un en-tête reste où la liste la met.
    assert.deepEqual(applied.cards.runes, [{ cardId: "r1", quantity: 12 }]);
  });

  it("signale les noms qu'aucune carte ne porte", () => {
    const applied = applyDeckText(parseDeckText("2 Carte fantôme", riftbound), resolve);

    assert.equal(applied.matched, 0);
    assert.deepEqual(applied.unmatched, ["Carte fantôme"]);
  });

  it("ne signale qu'une fois un nom inconnu présent dans deux sections", () => {
    const applied = applyDeckText(
      parseDeckText("Deck principal :\n2 Carte fantôme\nRéserve :\n1 Carte fantôme", riftbound),
      resolve
    );

    assert.deepEqual(applied.unmatched, ["Carte fantôme"]);
  });
});

describe("application au deck en cours", () => {
  const current: DeckCards = {
    legend: [{ cardId: "l1", quantity: 1 }],
    champions: [{ cardId: "c1", quantity: 1 }],
    maindeck: [{ cardId: "m1", quantity: 3 }],
    runes: [{ cardId: "r1", quantity: 11 }],
  };

  it("complète les zones atteintes par le seul rangement, sans effacer le reste", () => {
    const parsed = parseDeckText("3 Get Excited!\n1 Fury Rune", riftbound);
    const applied: DeckCards = {
      maindeck: [{ cardId: "m2", quantity: 3 }],
      runes: [{ cardId: "r1", quantity: 1 }],
    };

    const changes = mergeDeckText(current, applied, parsed, riftbound);

    // Le deck principal reçoit les lignes sans en-tête : il est remplacé.
    assert.deepEqual(changes.maindeck, [{ cardId: "m2", quantity: 3 }]);
    // La rune s'ajoute aux onze autres.
    assert.deepEqual(changes.runes, [{ cardId: "r1", quantity: 12 }]);
    // Les zones que la liste ne touche pas ne sont pas dans les changements.
    assert.equal(changes.legend, undefined);
    assert.equal(changes.champions, undefined);
  });

  it("remplace une zone nommée par un en-tête", () => {
    const parsed = parseDeckText("Runes :\n12 Fury Rune", riftbound);
    const changes = mergeDeckText(current, { runes: [{ cardId: "r2", quantity: 12 }] }, parsed, riftbound);

    assert.deepEqual(changes.runes, [{ cardId: "r2", quantity: 12 }]);
  });

  it("range en voyant ce qui restera du deck", () => {
    const kept = keptDeckCards(current, parseDeckText("3 Get Excited!\nChampion choisi :\n1 Jinx", riftbound), riftbound);

    // Le champion choisi et le deck principal vont être remplacés : ils ne
    // comptent plus comme places prises.
    assert.deepEqual(Object.keys(kept).sort(), ["legend", "runes"]);
  });
});

describe("renommage dans une liste collée", () => {
  it("ne change que les lignes qui portent exactement ce nom", () => {
    const text = "3 Strike\n2x Thunder Strike\n- strike";

    assert.equal(renameDeckTextCard(text, "Strike", "Strike Down"), "3 Strike Down\n2x Thunder Strike\n- Strike Down");
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
