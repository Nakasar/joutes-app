import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents";
import {
  buildBusinessCard,
  businessCardFilename,
  businessCardFooter,
  businessCardLines,
  columnHeight,
  listsHeight,
} from "@/lib/decks/business-card";
import { getDeckZones } from "@/lib/decks/zones";

const riftbound = getDeckZones({ slug: "riftbound" });
const generic = getDeckZones({ slug: "autre-jeu" });

const catalog: DeckCardInfo[] = [
  { id: "L", name: "Ivern, Green Father", type: "Legend", domain: ["Calm", "Order"], image: "https://img/l.png" },
  { id: "C", name: "Ivern, Nurturer", type: "Unit", superType: "Champion", cost: 5, domain: ["Calm"] },
  { id: "U1", name: "Trusty Ramhound", type: "Unit", cost: 2 },
  { id: "U2", name: "Daisy!", type: "Unit", cost: 9 },
  { id: "U3", name: "Loyal Poro", type: "Unit", cost: 3 },
  { id: "S1", name: "Defy", type: "Spell", cost: 1 },
  { id: "S2", name: "Back Off", type: "Spell", cost: 3 },
  { id: "G1", name: "Boots of Swiftness", type: "Gear", cost: 3 },
  { id: "R1", name: "Calm Rune", type: "Rune", domain: ["Calm"] },
  { id: "R2", name: "Order Rune", type: "Rune", domain: ["Order"] },
  { id: "B1", name: "Vilemaw's Lair", type: "Battlefield", domain: ["Colorless"] },
];
const cardsById = new Map(catalog.map((card) => [card.id, card]));

const cards: DeckCards = {
  legend: [{ cardId: "L", quantity: 1 }],
  champions: [{ cardId: "C", quantity: 1 }],
  maindeck: [
    { cardId: "U2", quantity: 2 },
    { cardId: "S2", quantity: 2 },
    { cardId: "U1", quantity: 3 },
    { cardId: "G1", quantity: 1 },
    { cardId: "U3", quantity: 3 },
    { cardId: "S1", quantity: 3 },
    { cardId: "C", quantity: 2 },
  ],
  runes: [
    { cardId: "R1", quantity: 6 },
    { cardId: "R2", quantity: 6 },
  ],
  battlefields: [{ cardId: "B1", quantity: 1 }],
  sideboard: [{ cardId: "S2", quantity: 1 }],
};

const deck = { name: "Le Zoo d'Ivern", creatorName: "Nakasar#6666", cards };

function build(overrides: Partial<Parameters<typeof buildBusinessCard>[0]> = {}) {
  return buildBusinessCard({
    deck,
    gameName: "Riftbound",
    gameSlug: "riftbound",
    zones: riftbound,
    cardsById,
    style: "illustrated",
    showName: true,
    qrUrl: "https://joutes.app/decks/x",
    ...overrides,
  });
}

describe("carte de visite d'un deck", () => {
  it("prend la légende, ses domaines et le champion choisi pour identité", () => {
    const layout = build();
    assert.equal(layout.kicker, "Légende");
    assert.equal(layout.title, "Ivern, Green Father");
    assert.equal(layout.subtitle, "Le Zoo d'Ivern · par Nakasar#6666");
    assert.deepEqual(layout.domains, ["Calm", "Order"]);
    assert.deepEqual(layout.champion, { name: "Ivern, Nurturer", cost: 5, image: undefined });
    assert.deepEqual(layout.art, { image: "https://img/l.png", legend: true });
  });

  it("range le deck principal en unités, sorts et équipement, triés par coût", () => {
    const sections = build().columns.flat();
    assert.deepEqual(
      sections.map((section) => [section.title, section.count]),
      [
        ["Unités", 10],
        ["Sorts", 5],
        ["Équipement", 1],
        ["Réserve", 1],
        ["Champs de bataille", 1],
      ]
    );
    assert.deepEqual(
      sections[0].lines.map((line) => `${line.quantity} ${line.name} ${line.cost}`),
      ["3 Trusty Ramhound 2", "3 Loyal Poro 3", "2 Ivern, Nurturer 5", "2 Daisy! 9"]
    );
    // Un champ de bataille n'a pas de coût à montrer.
    assert.equal(sections[4].lines[0].cost, undefined);
  });

  it("met les runes en pastilles, avec leur domaine", () => {
    assert.deepEqual(build().chips, {
      title: "Runes",
      count: 12,
      items: [
        { label: "Calm", quantity: 6, domain: "Calm" },
        { label: "Order", quantity: 6, domain: "Order" },
      ],
    });
  });

  it("masque le nom du deck sur demande", () => {
    assert.equal(build({ showName: false }).subtitle, undefined);
  });

  it("réunit deux impressions d'une même carte sur une ligne", () => {
    const twins = new Map(cardsById);
    twins.set("S1b", { id: "S1b", name: "Defy", type: "Spell", cost: 1 });
    const lines = businessCardLines(
      [
        { cardId: "S1", quantity: 2 },
        { cardId: "S1b", quantity: 1 },
      ],
      twins
    );
    assert.deepEqual(lines, [{ quantity: 3, name: "Defy", cost: 1 }]);
  });

  it("compte le champion à part du deck principal, et la réserve", () => {
    assert.equal(businessCardFooter(cards, riftbound), "16 + 1 cartes · réserve 1");
    assert.equal(businessCardFooter({ maindeck: [{ cardId: "x", quantity: 60 }] }, generic), "60 cartes");
  });

  it("garde le nom du deck pour titre quand le jeu n'a pas de légende", () => {
    const layout = build({ gameSlug: "autre-jeu", zones: generic, deck: { ...deck, cards: { maindeck: cards.maindeck } } });
    assert.equal(layout.kicker, "Deck");
    assert.equal(layout.title, "Le Zoo d'Ivern");
    assert.equal(layout.subtitle, "par Nakasar#6666");
    assert.equal(layout.champion, undefined);
    // Les types du jeu, du plus représenté au moins représenté.
    assert.deepEqual(
      layout.columns.flat().map((section) => section.title),
      ["Unit", "Spell", "Gear"]
    );
  });

  it("resserre les lignes puis coupe une liste trop longue en « + N autres »", () => {
    const many: DeckCardInfo[] = Array.from({ length: 70 }, (_, index) => ({
      id: `M${index}`,
      name: `Carte ${String(index).padStart(2, "0")}`,
      type: "Unit",
      cost: index % 8,
    }));
    const byId = new Map(many.map((card) => [card.id, card]));
    const layout = build({
      cardsById: byId,
      deck: { name: "Gros deck", cards: { maindeck: many.map((card) => ({ cardId: card.id, quantity: 1 })) } },
    });
    const available = listsHeight("illustrated", false);
    assert.equal(layout.density.row, 19.5);
    const units = layout.columns.flat().find((section) => section.title === "Unités")!;
    assert.ok(units.hidden > 0);
    assert.equal(units.lines.length + units.hidden, 70);
    assert.ok(columnHeight(layout.columns[0], layout.density.row) <= available);
  });

  it("nomme le fichier d'après le deck", () => {
    assert.equal(businessCardFilename("Le Zoo d'Ivern !"), "carte-le-zoo-d-ivern.png");
    assert.equal(businessCardFilename("???"), "carte-deck.png");
  });
});
