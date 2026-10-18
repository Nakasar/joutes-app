import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joutesUrl, linkLine, mcpLinks } from "./links";

const env = { NEXT_PUBLIC_BASE_URL: "https://joutes.test/" };

describe("liens des outils MCP", () => {
    it("donne une adresse absolue, sans double barre oblique", () => {
        assert.equal(joutesUrl("/events/abc", env), "https://joutes.test/events/abc");
    });

    it("retombe sur joutes.app sans configuration", () => {
        assert.equal(joutesUrl("/lairs/1", {}), "https://joutes.app/lairs/1");
    });

    it("mène un errata à la fiche de sa carte, ancré sur l'errata", () => {
        assert.equal(
            mcpLinks.errata("65f0", "riftbound", "OGN-001", env),
            "https://joutes.test/games/riftbound/cards/OGN-001#errata-65f0",
        );
    });

    it("distingue la collection personnelle de celle d'un groupe", () => {
        assert.equal(mcpLinks.collection("riftbound", undefined, env), "https://joutes.test/collection/riftbound");
        assert.equal(
            mcpLinks.collection("riftbound", "g1", env),
            "https://joutes.test/play-groups/g1/collection/riftbound",
        );
    });

    it("échappe les identifiants", () => {
        assert.equal(mcpLinks.wishlist("a b/c", env), "https://joutes.test/wishlists/a%20b%2Fc");
    });

    it("forme la ligne ajoutée au texte", () => {
        assert.equal(linkLine("https://joutes.test/x"), "\n\nLien : https://joutes.test/x");
    });
});
