import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createJoutesWebMcpTools, sanitizeInternalPath, type WebMcpToolDeps } from "@/lib/webmcp/tools";
import type { WebMcpTool } from "@/lib/webmcp/types";

/**
 * Tests des outils WebMCP exposés aux agents.
 *
 * Deux choses tiennent ici : la forme des outils, qu'un agent lit avant de
 * décider s'il les appelle (nom, description, schéma d'entrée), et le fait
 * qu'un outil rende une erreur lisible plutôt que de lever — un agent ne voit
 * qu'un texte, jamais une exception.
 *
 * Exécution : `npm run test`.
 */

type FetchCall = { path: string };

function deps(
    responder: (path: string) => { status?: number; body?: unknown } = () => ({ body: {} })
): WebMcpToolDeps & { calls: FetchCall[]; navigations: string[] } {
    const calls: FetchCall[] = [];
    const navigations: string[] = [];

    return {
        calls,
        navigations,
        fetch: async (path: string) => {
            calls.push({ path });
            const { status = 200, body = {} } = responder(path);
            return new Response(JSON.stringify(body), {
                status,
                headers: { "Content-Type": "application/json" },
            });
        },
        navigate: (path: string) => {
            navigations.push(path);
        },
        currentPage: () => ({ url: "https://joutes.app/events", path: "/events", title: "Événements" }),
    };
}

function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
    const found = tools.find((tool) => tool.name === name);
    assert.ok(found, `outil "${name}" absent`);
    return found;
}

describe("createJoutesWebMcpTools", () => {
    it("décrit chaque outil avec ce qu'attend WebMCP", () => {
        for (const tool of createJoutesWebMcpTools(deps())) {
            assert.match(tool.name, /^[a-z][a-z0-9_]*$/, `nom d'outil invalide : ${tool.name}`);
            assert.ok(tool.description.length > 20, `description trop courte : ${tool.name}`);
            assert.equal(tool.inputSchema.type, "object");
            assert.equal(typeof tool.execute, "function");
        }
    });

    it("ne déclare pas deux outils du même nom", () => {
        const names = createJoutesWebMcpTools(deps()).map((tool) => tool.name);
        assert.equal(new Set(names).size, names.length);
    });

    it("marque en lecture seule les outils qui ne modifient rien", () => {
        const tools = createJoutesWebMcpTools(deps());
        assert.equal(toolNamed(tools, "search_joutes").annotations?.readOnlyHint, true);
        // La navigation change ce que l'utilisateur a sous les yeux.
        assert.equal(toolNamed(tools, "navigate_joutes").annotations?.readOnlyHint, false);
    });
});

describe("search_joutes", () => {
    it("interroge /api/search et regroupe les résultats par rubrique", async () => {
        const dependencies = deps(() => ({
            body: {
                games: [{ label: "Riftbound", sublabel: "TCG", href: "/games/riftbound" }],
                cards: [],
                lairs: [],
                events: [{ label: "Tournoi du samedi", href: "/events/42" }],
                rules: [],
            },
        }));
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_joutes");

        const result = await tool.execute({ query: "riftbound" });

        assert.equal(dependencies.calls[0].path, "/api/search?q=riftbound");
        const text = result.content[0].text;
        assert.match(text, /Riftbound/);
        assert.match(text, /Tournoi du samedi/);
        // Les rubriques vides ne sont pas rendues : elles n'apprennent rien.
        assert.doesNotMatch(text, /Cartes/);
    });

    it("refuse une recherche trop courte sans appeler le site", async () => {
        const dependencies = deps();
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_joutes");

        const result = await tool.execute({ query: "r" });

        assert.equal(result.isError, true);
        assert.deepEqual(dependencies.calls, []);
    });

    it("rend un message lisible plutôt qu'une exception quand le site échoue", async () => {
        const dependencies = deps(() => ({ status: 500 }));
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_joutes");

        const result = await tool.execute({ query: "riftbound" });

        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /500/);
    });

    it("signale qu'une connexion est nécessaire sur un 401", async () => {
        const dependencies = deps(() => ({ status: 401 }));
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_joutes");

        const result = await tool.execute({ query: "riftbound" });

        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /connecté/);
    });
});

describe("search_cards", () => {
    it("borne le nombre de cartes demandées", async () => {
        const dependencies = deps(() => ({ body: { cards: [], total: 0 } }));
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_cards");

        await tool.execute({ game: "riftbound", query: "Yasuo", limit: 500 });

        const url = new URL(dependencies.calls[0].path, "https://joutes.app");
        assert.equal(url.pathname, "/api/games/riftbound/cards");
        assert.equal(url.searchParams.get("searchQuery"), "Yasuo");
        assert.equal(url.searchParams.get("limit"), "50");
    });

    it("demande le slug du jeu quand il manque", async () => {
        const dependencies = deps();
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_cards");

        const result = await tool.execute({ query: "Yasuo" });

        assert.equal(result.isError, true);
        assert.deepEqual(dependencies.calls, []);
    });
});

describe("search_events", () => {
    it("transmet la position quand elle est fournie", async () => {
        const dependencies = deps(() => ({ body: { events: [] } }));
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_events");

        await tool.execute({ latitude: 48.85, longitude: 2.35, maxDistanceKm: 30 });

        const url = new URL(dependencies.calls[0].path, "https://joutes.app");
        assert.equal(url.searchParams.get("userLat"), "48.85");
        assert.equal(url.searchParams.get("userLon"), "2.35");
        assert.equal(url.searchParams.get("maxDistance"), "30");
    });

    it("explique l'absence de résultats hors connexion", async () => {
        const dependencies = deps(() => ({ body: { events: [] } }));
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "search_events");

        const result = await tool.execute({});

        assert.match(result.content[0].text, /position/);
    });
});

describe("navigate_joutes", () => {
    it("ouvre un chemin interne", async () => {
        const dependencies = deps();
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "navigate_joutes");

        const result = await tool.execute({ path: "/games/riftbound/cards" });

        assert.deepEqual(dependencies.navigations, ["/games/riftbound/cards"]);
        assert.notEqual(result.isError, true);
    });

    it("refuse d'emmener l'utilisateur hors du site", async () => {
        const dependencies = deps();
        const tool = toolNamed(createJoutesWebMcpTools(dependencies), "navigate_joutes");

        for (const path of ["https://ailleurs.example", "//ailleurs.example", "javascript:alert(1)", "events"]) {
            const result = await tool.execute({ path });
            assert.equal(result.isError, true, `chemin accepté à tort : ${path}`);
        }
        assert.deepEqual(dependencies.navigations, []);
    });
});

describe("sanitizeInternalPath", () => {
    it("accepte les chemins du site", () => {
        assert.equal(sanitizeInternalPath("/events"), "/events");
        assert.equal(sanitizeInternalPath("  /events?month=3  "), "/events?month=3");
    });

    it("rejette tout ce qui pourrait sortir du site", () => {
        assert.equal(sanitizeInternalPath("//ailleurs.example"), null);
        assert.equal(sanitizeInternalPath("https://ailleurs.example"), null);
        assert.equal(sanitizeInternalPath("javascript:alert(1)"), null);
        assert.equal(sanitizeInternalPath("/\\ailleurs.example"), null);
    });
});

describe("get_current_page", () => {
    it("rend l'adresse et le titre de la page regardée", async () => {
        const tool = toolNamed(createJoutesWebMcpTools(deps()), "get_current_page");

        const result = await tool.execute({});

        assert.match(result.content[0].text, /https:\/\/joutes\.app\/events/);
        assert.match(result.content[0].text, /Événements/);
    });
});
