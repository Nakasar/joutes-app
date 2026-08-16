import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findModelContexts, registerWebMcpTools, type WebMcpScope } from "@/lib/webmcp/register";
import type { ModelContextLike, WebMcpTool } from "@/lib/webmcp/types";

/**
 * Tests de la déclaration des outils WebMCP.
 *
 * Ce qui se joue ici est la cohabitation de deux API : `registerTool`, de la
 * spécification, et `provideContext`, de l'early preview Chrome. Le site ne
 * choisit pas — il déclare ses outils sur ce que le navigateur expose, sans
 * jamais lever ni déclarer deux fois le même outil au même endroit.
 *
 * Exécution : `npm run test`.
 */

function tool(name: string): WebMcpTool {
    return {
        name,
        description: `Outil ${name}`,
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    };
}

const TOOLS = [tool("a"), tool("b")];

/** `modelContext` qui n'expose que `registerTool`, et note ses appels. */
function registerToolContext() {
    const calls: { name: string; signal?: AbortSignal }[] = [];
    const context: ModelContextLike = {
        registerTool: (registered, options) => {
            calls.push({ name: registered.name, signal: options?.signal });
            return Promise.resolve();
        },
    };
    return { context, calls };
}

/** `modelContext` qui n'expose que `provideContext`, et note ses appels. */
function provideContextContext() {
    const calls: string[][] = [];
    const context: ModelContextLike = {
        provideContext: ({ tools }) => {
            calls.push(tools.map((registered) => registered.name));
            return Promise.resolve();
        },
    };
    return { context, calls };
}

describe("findModelContexts", () => {
    it("ne trouve rien sur un navigateur sans WebMCP", () => {
        assert.deepEqual(findModelContexts({ navigator: {}, document: {} }), []);
    });

    it("dédoublonne quand navigator et document portent le même objet", () => {
        const { context } = registerToolContext();
        const scope: WebMcpScope = { navigator: { modelContext: context }, document: { modelContext: context } };

        const found = findModelContexts(scope);

        assert.equal(found.length, 1);
        assert.equal(found[0].surface, "navigator");
    });

    it("garde les deux surfaces quand ce sont deux objets distincts", () => {
        const scope: WebMcpScope = {
            navigator: { modelContext: registerToolContext().context },
            document: { modelContext: registerToolContext().context },
        };

        assert.deepEqual(
            findModelContexts(scope).map((entry) => entry.surface),
            ["navigator", "document"]
        );
    });
});

describe("registerWebMcpTools", () => {
    it("ne fait rien, sans échouer, quand WebMCP est absent", () => {
        const report = registerWebMcpTools(TOOLS, { scope: { navigator: {}, document: {} } });

        assert.deepEqual(report.surfaces, []);
        assert.deepEqual(report.errors, []);
    });

    it("déclare chaque outil via registerTool, avec le signal de retrait", () => {
        const { context, calls } = registerToolContext();
        const controller = new AbortController();

        const report = registerWebMcpTools(TOOLS, {
            scope: { navigator: { modelContext: context } },
            signal: controller.signal,
        });

        assert.deepEqual(
            calls.map((call) => call.name),
            ["a", "b"]
        );
        // Sans ce signal, les outils d'une page démontée resteraient déclarés.
        assert.ok(calls.every((call) => call.signal === controller.signal));
        assert.deepEqual(report.surfaces, [{ surface: "navigator", method: "registerTool", tools: ["a", "b"] }]);
    });

    it("passe par provideContext quand registerTool n'existe pas", () => {
        const { context, calls } = provideContextContext();

        const report = registerWebMcpTools(TOOLS, { scope: { navigator: { modelContext: context } } });

        assert.deepEqual(calls, [["a", "b"]]);
        assert.deepEqual(report.surfaces, [{ surface: "navigator", method: "provideContext", tools: ["a", "b"] }]);
    });

    it("retire les outils déclarés par provideContext quand le signal est déclenché", () => {
        const { context, calls } = provideContextContext();
        const controller = new AbortController();

        registerWebMcpTools(TOOLS, { scope: { navigator: { modelContext: context } }, signal: controller.signal });
        controller.abort();

        // `provideContext` remplace le jeu d'outils : le vider est le seul
        // moyen de les retirer.
        assert.deepEqual(calls, [["a", "b"], []]);
    });

    it("ne déclare rien si le signal est déjà déclenché", () => {
        const { context, calls } = registerToolContext();
        const controller = new AbortController();
        controller.abort();

        const report = registerWebMcpTools(TOOLS, {
            scope: { navigator: { modelContext: context } },
            signal: controller.signal,
        });

        assert.deepEqual(calls, []);
        assert.deepEqual(report.surfaces, []);
    });

    it("ne déclare qu'une fois par surface, sans doubler avec provideContext", () => {
        const provideCalls: string[][] = [];
        const registerCalls: string[] = [];
        const context: ModelContextLike = {
            registerTool: (registered) => {
                registerCalls.push(registered.name);
            },
            provideContext: ({ tools }) => {
                provideCalls.push(tools.map((registered) => registered.name));
            },
        };

        registerWebMcpTools(TOOLS, { scope: { navigator: { modelContext: context } } });

        assert.deepEqual(registerCalls, ["a", "b"]);
        assert.deepEqual(provideCalls, []);
    });

    it("retombe sur provideContext quand registerTool rejette tous les outils", () => {
        const provideCalls: string[][] = [];
        const context: ModelContextLike = {
            registerTool: () => {
                throw new Error("non supporté");
            },
            provideContext: ({ tools }) => {
                provideCalls.push(tools.map((registered) => registered.name));
            },
        };

        const report = registerWebMcpTools(TOOLS, { scope: { navigator: { modelContext: context } } });

        assert.deepEqual(provideCalls, [["a", "b"]]);
        assert.equal(report.errors.length, 2);
        assert.deepEqual(report.surfaces, [{ surface: "navigator", method: "provideContext", tools: ["a", "b"] }]);
    });

    it("déclare sur les deux surfaces quand elles sont distinctes", () => {
        const navigatorContext = registerToolContext();
        const documentContext = provideContextContext();

        const report = registerWebMcpTools(TOOLS, {
            scope: {
                navigator: { modelContext: navigatorContext.context },
                document: { modelContext: documentContext.context },
            },
        });

        assert.deepEqual(
            report.surfaces.map((entry) => `${entry.surface}.${entry.method}`),
            ["navigator.registerTool", "document.provideContext"]
        );
    });
});
