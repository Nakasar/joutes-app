import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeNews, describeNewsLine, newsLang } from "./news";
import type { News } from "@/lib/types/News";

const base: News = {
    id: "n1",
    title: "Nouvelle extension",
    summary: "Ce qu'il faut savoir.",
    content: "## Détails\n\nTout le texte.",
    originalLang: "fr",
    contentUpdatedAt: new Date("2026-11-02T10:00:00Z"),
    translations: [
        { lang: "en", title: "New set", summary: "", content: "All the text.", updatedAt: new Date("2026-11-01T10:00:00Z") },
    ],
    source: { name: "playriftbound.com", url: "https://playriftbound.com/news" },
    gameIds: ["g1"],
    games: [{ id: "g1", name: "Riftbound", slug: "riftbound" }],
    tags: ["annonce"],
    authorId: "u1",
    author: { id: "u1", displayName: "Kev", discriminator: "0001" },
    likedBy: [],
    likesCount: 3,
    createdAt: new Date("2026-11-02T09:00:00Z"),
    updatedAt: new Date("2026-11-02T10:00:00Z"),
};

describe("newsLang", () => {
    it("sert la langue demandée si elle existe, sinon la VO", () => {
        assert.equal(newsLang(base, "en"), "en");
        assert.equal(newsLang(base, "es" as never), "fr");
        assert.equal(newsLang(base), "fr");
    });
});

describe("describeNewsLine", () => {
    it("donne titre, date, jeux, tags, résumé, id et lien", () => {
        const text = describeNewsLine(base, undefined, "https://joutes.app/news/n1");
        assert.match(text, /^- \*\*Nouvelle extension\*\* — 2 nov\. 2026 · Riftbound · #annonce/);
        assert.match(text, /\n  Ce qu'il faut savoir\.\n  id n1 · https:\/\/joutes\.app\/news\/n1$/);
    });

    it("traduit champ par champ", () => {
        const text = describeNewsLine(base, "en", "x");
        assert.match(text, /\*\*New set\*\*/);
        // Résumé non traduit : la VO reste.
        assert.match(text, /Ce qu'il faut savoir\./);
    });
});

describe("describeNews", () => {
    it("rend le texte complet avec sa source", () => {
        const text = describeNews(base, undefined, "https://joutes.app/news/n1");
        assert.match(text, /^# Nouvelle extension\nPubliée le 2 nov\. 2026 · par Kev#0001 · jeux : Riftbound · tags : annonce · 3 j'aime/);
        assert.match(text, /VO \(fr\)\. Langues disponibles : fr, en\./);
        assert.match(text, /Source : playriftbound\.com — https:\/\/playriftbound\.com\/news/);
        assert.match(text, /## Détails\n\nTout le texte\./);
        assert.match(text, /id n1 · Lien : https:\/\/joutes\.app\/news\/n1$/);
    });

    it("signale une traduction en retard sur la VO", () => {
        assert.match(describeNews(base, "en", "x"), /Traduction en \(VO fr\), peut-être en retard sur la VO\./);
    });

    it("dit quand la langue demandée n'existe pas", () => {
        const text = describeNews({ ...base, translations: [], source: undefined }, "en", "x");
        assert.match(text, /Pas de traduction en en : texte en VO \(fr\)\./);
        assert.doesNotMatch(text, /Source :/);
    });
});
