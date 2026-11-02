import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    boosterEditions,
    describeBooster,
    describeBoosterCard,
    findCardPrinting,
    findEdition,
    formatBoosterValue,
} from "./boosters";
import type { Booster, BoosterCard } from "@/lib/types/booster";

const jinx: BoosterCard = {
    id: "e1",
    name: "Jinx",
    subtitle: "Loose Cannon",
    setCode: "OGN",
    collectorNumber: "202",
    image: "",
    printings: [
        { id: "showcase", name: "Showcase", foil: true },
        { id: "signature", name: "Signature (202)" },
    ],
};

const teemo: BoosterCard = {
    id: "e2",
    name: "Teemo",
    setCode: "OGN",
    collectorNumber: "010",
    image: "",
    foil: true,
    printingName: "Showcase",
    printings: [{ id: "showcase", name: "Showcase", foil: true }],
};

describe("boosters dans les outils MCP", () => {
    it("liste une fois chaque édition des cartes du booster", () => {
        assert.deepEqual(
            boosterEditions([jinx, teemo]).map((edition) => edition.name),
            ["Showcase", "Signature"],
        );
    });

    it("retrouve une édition par son nom sans tenir compte de la casse, et la version de base", () => {
        const editions = boosterEditions([jinx]);
        assert.equal(findEdition(editions, "showcase")?.name, "Showcase");
        assert.equal(findEdition(editions, "Base"), null);
        assert.equal(findEdition(editions, "Défaut"), null);
        assert.equal(findEdition(editions, "Alt art"), undefined);
    });

    it("retrouve la variante d'une carte par son nom, son édition ou son identifiant", () => {
        assert.equal(findCardPrinting(jinx, "Signature")?.id, "signature");
        assert.equal(findCardPrinting(jinx, "signature (202)")?.id, "signature");
        assert.equal(findCardPrinting(jinx, "showcase")?.id, "showcase");
        assert.equal(findCardPrinting(jinx, "normale"), null);
        assert.equal(findCardPrinting(jinx, "Promo"), undefined);
        assert.equal(findCardPrinting({ printings: [] }, "Showcase"), undefined);
    });

    it("dit sur combien de cartes repose la valeur", () => {
        const value = { amount: 12.5, currency: "EUR", cardCount: 14, pricedCards: 10, computedAt: "" };
        assert.match(formatBoosterValue(value), /12,50\s€ \(10\/14 cartes cotées\)/);
        assert.equal(formatBoosterValue({ ...value, pricedCards: 0 }), "aucune carte cotée");
        assert.equal(formatBoosterValue(undefined), "non estimée");
    });

    it("donne l'identifiant de chaque exemplaire, avec foil et variante", () => {
        assert.equal(describeBoosterCard(teemo), "- Teemo (OGN #010) [foil, Showcase] — exemplaire `e2`");
        assert.equal(describeBoosterCard(jinx), "- Jinx, Loose Cannon (OGN #202) — exemplaire `e1`");
    });

    it("décrit un booster avec son contenu et ses variantes", () => {
        const booster: Booster = {
            id: "b1",
            gameId: "g1",
            userId: "u1",
            setCode: "OGN",
            lang: "fr",
            type: "booster",
            note: "Ouvert au salon",
            cards: [jinx, teemo],
            archived: false,
            addedToCollection: true,
            createdAt: "2026-11-02T10:00:00.000Z",
        };
        const text = describeBooster(booster, "Booster", "Riftbound");
        assert.match(text, /^Booster \*\*b1\*\* — Riftbound, Booster, OGN \(FR\), ouvert le 2026-11-02\./);
        assert.match(text, /Ses cartes sont dans la collection\./);
        assert.match(text, /Note : « Ouvert au salon »/);
        assert.match(text, /2 carte\(s\) :\n- Jinx/);
        assert.match(text, /Variantes possibles : Showcase, Signature\./);
    });
});
