import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyDeckChanges, describeChanges, describeDeck, describeLegality, findZone } from "./decks";
import { getDeckZones } from "@/lib/decks/zones";
import { normalizeCardName } from "@/lib/decks/text";
import type { DeckCardInfo } from "@/lib/decks/contents";
import type { DeckEditorDeck } from "@/mcp-apps/deck-editor/result";

const zones = getDeckZones({ slug: "riftbound" });

const card = (id: string, name: string, extra: Partial<DeckCardInfo> = {}): DeckCardInfo => ({ id, name, type: "Unit", ...extra });
const catalog = [
    card("OGN-269", "Jinx, Loose Cannon", { type: "Legend" }),
    card("OGN-202", "Jinx, Rebel", { superType: "Champion", cost: 4 }),
    card("OGN-012", "Flame Chompers", { cost: 3 }),
    card("OGN-111", "Void Seeker", { type: "Spell", cost: 2 }),
    card("OGN-007", "Fury Rune", { type: "Rune" }),
    card("OGN-291", "Zaun Warrens", { type: "Battlefield" }),
];
const byName = new Map(catalog.map((c) => [normalizeCardName(c.name), c]));

describe("findZone", () => {
    it("reconnaît la clé, le libellé et le libellé court, sans casse ni accents", () => {
        assert.equal(findZone(zones, "runes")?.key, "runes");
        assert.equal(findZone(zones, "deck principal")?.key, "maindeck");
        assert.equal(findZone(zones, "LEGENDE")?.key, "legend");
        assert.equal(findZone(zones, "cimetière"), undefined);
    });
});

describe("applyDeckChanges", () => {
    it("range un ajout sans zone comme l'éditeur du site", () => {
        const result = applyDeckChanges({}, zones, [
            { cardName: "Jinx, Loose Cannon", quantity: 1 },
            { cardName: "jinx, rebel", quantity: 3 },
            { cardName: "Fury Rune", quantity: 6 },
            { cardName: "Zaun Warrens", quantity: 1 },
        ], byName);

        assert.deepEqual(result.cards.legend, [{ cardId: "OGN-269", quantity: 1 }]);
        // Exemplaire par exemplaire : le premier prend la place du champion
        // choisi, les deux autres vont au deck principal.
        assert.deepEqual(result.cards.champions, [{ cardId: "OGN-202", quantity: 1 }]);
        assert.deepEqual(result.cards.maindeck, [{ cardId: "OGN-202", quantity: 2 }]);
        assert.ok(result.applied.includes("+1 Jinx, Rebel (Champion choisi)"));
        assert.ok(result.applied.includes("+2 Jinx, Rebel (Deck principal)"));
        assert.deepEqual(result.cards.runes, [{ cardId: "OGN-007", quantity: 6 }]);
        assert.deepEqual(result.cards.battlefields, [{ cardId: "OGN-291", quantity: 1 }]);
        assert.deepEqual(result.skipped, []);
    });

    it("retire depuis la zone qui porte la carte, sans descendre sous zéro", () => {
        const result = applyDeckChanges(
            { maindeck: [{ cardId: "OGN-012", quantity: 2 }] },
            zones,
            [{ cardName: "Flame Chompers", quantity: -5 }, { cardName: "Void Seeker", quantity: 3 }],
            byName,
        );

        assert.deepEqual(result.cards.maindeck, [{ cardId: "OGN-111", quantity: 3 }]);
        assert.deepEqual(result.applied, ["−2 Flame Chompers (Deck principal)", "+3 Void Seeker (Deck principal)"]);
    });

    it("respecte une zone demandée et signale ce qui ne s'applique pas", () => {
        const result = applyDeckChanges({}, zones, [
            { cardName: "Void Seeker", quantity: 2, zone: "réserve" },
            { cardName: "Hextech Gauntlet", quantity: 1 },
            { cardName: "Void Seeker", quantity: 1, zone: "cimetière" },
            { cardName: "Flame Chompers", quantity: -1 },
        ], byName);

        assert.deepEqual(result.cards.sideboard, [{ cardId: "OGN-111", quantity: 2 }]);
        assert.equal(result.skipped.length, 3);
        assert.match(result.skipped[0], /Hextech Gauntlet : carte introuvable/);
        assert.match(result.skipped[1], /zone « cimetière » inconnue/);
        assert.match(result.skipped[2], /Flame Chompers : pas dans le deck/);
    });
});

describe("Neeko", () => {
    it("compte quatre légendes comme conformes quand Neeko est dans le deck", () => {
        const cards = {
            legend: [{ cardId: "OGN-269", quantity: 1 }, { cardId: "L2", quantity: 1 }, { cardId: "L3", quantity: 1 }, { cardId: "L4", quantity: 1 }],
            maindeck: [{ cardId: "RAD-167", quantity: 1 }],
        };
        assert.ok(describeLegality(cards, zones).some((line) => line.startsWith("Légende 4 / 4") && line.endsWith("conforme")));
    });
});

describe("textes", () => {
    const deck: DeckEditorDeck = {
        id: "d1",
        name: "Jinx Fureur",
        gameId: "g1",
        gameName: "Riftbound",
        gameSlug: "riftbound",
        visibility: "private",
        version: 3,
        cards: {
            legend: [{ cardId: "OGN-269", quantity: 1 }],
            champions: [{ cardId: "OGN-202", quantity: 1 }],
            maindeck: [{ cardId: "OGN-202", quantity: 4 }],
            runes: [{ cardId: "OGN-007", quantity: 6 }],
        },
        zones,
        catalog,
        owned: { "OGN-202": 2 },
        copyLimit: 3,
        url: "https://joutes.app/decks/d1",
        editUrl: "https://joutes.app/decks/d1/edit",
    };

    it("décrit la légalité zone par zone, et le dépassement d'exemplaires", () => {
        const lines = describeLegality(deck.cards, deck.zones, deck.copyLimit);
        assert.ok(lines.includes("Légende 1 / 1 — 1 exactement : conforme"));
        assert.ok(lines.some((line) => line.startsWith("Deck principal 4 + 1 = 5") && line.endsWith("à ajuster")));
        assert.ok(lines.includes("Une carte dépasse 3 exemplaires (5) : à ajuster"));
    });

    it("liste les cartes avec leurs exemplaires possédés", () => {
        const text = describeDeck(deck);
        assert.match(text, /\*\*Jinx Fureur\*\* — Riftbound, privé, version 3/);
        assert.match(text, /- 4 Jinx, Rebel \(Unit, coût 4, 2 possédée\(s\)\)/);
    });

    it("résume des changements", () => {
        const text = describeChanges({ cards: deck.cards, applied: ["+1 Void Seeker (Deck principal)"], skipped: ["X : carte introuvable dans ce jeu."] }, deck);
        assert.match(text, /Deck \*\*Jinx Fureur\*\* modifié \(version 3\)/);
        assert.match(text, /Non appliqué :\n- X : carte introuvable/);
    });
});
