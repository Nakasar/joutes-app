import type { ModelContextLike, WebMcpTool } from "@/lib/webmcp/types";

/** Endroit où le navigateur expose `modelContext`. */
export type WebMcpSurface = "navigator" | "document";

/** Méthode utilisée pour déclarer les outils sur une surface donnée. */
export type WebMcpMethod = "registerTool" | "provideContext";

export type WebMcpSurfaceReport = {
    surface: WebMcpSurface;
    method: WebMcpMethod;
    /** Noms des outils effectivement déclarés sur cette surface. */
    tools: string[];
};

export type WebMcpRegistrationReport = {
    /** Vide quand le navigateur n'implémente pas WebMCP. */
    surfaces: WebMcpSurfaceReport[];
    /** Erreurs rencontrées, sans interrompre les autres déclarations. */
    errors: string[];
};

export type WebMcpScope = {
    navigator?: { modelContext?: ModelContextLike };
    document?: { modelContext?: ModelContextLike };
};

export type RegisterWebMcpToolsOptions = {
    /** Retire les outils quand il est déclenché (démontage du composant). */
    signal?: AbortSignal;
    /** Injection pour les tests ; par défaut les globales du navigateur. */
    scope?: WebMcpScope;
};

/**
 * Liste les objets `modelContext` disponibles, dédoublonnés par identité :
 * `navigator.modelContext` et `document.modelContext` peuvent être le même
 * objet, auquel cas déclarer les outils deux fois lèverait un conflit de noms.
 */
export function findModelContexts(scope: WebMcpScope): { surface: WebMcpSurface; context: ModelContextLike }[] {
    const found: { surface: WebMcpSurface; context: ModelContextLike }[] = [];

    const candidates: { surface: WebMcpSurface; context: ModelContextLike | undefined }[] = [
        { surface: "navigator", context: scope.navigator?.modelContext },
        { surface: "document", context: scope.document?.modelContext },
    ];

    for (const { surface, context } of candidates) {
        if (!context) continue;
        if (found.some((entry) => entry.context === context)) continue;
        found.push({ surface, context });
    }

    return found;
}

function defaultScope(): WebMcpScope {
    return {
        navigator: typeof navigator === "undefined" ? undefined : navigator,
        document: typeof document === "undefined" ? undefined : document,
    };
}

/**
 * Déclare les outils un par un via `registerTool`, la forme de la
 * spécification : l'`AbortSignal` passé à chaque appel les retire, ce qui
 * permet de suivre la navigation client (les outils d'une page démontée
 * disparaissent).
 *
 * Rend `true` si au moins un outil a été accepté. Un refus se lit aussi bien
 * sur une exception que sur une promesse rejetée : les deux sont attendues
 * avant de conclure, sans quoi l'appelant croirait la page outillée alors
 * qu'elle ne l'est pas.
 */
async function registerToolByTool(
    surface: WebMcpSurface,
    context: ModelContextLike,
    tools: WebMcpTool[],
    signal: AbortSignal | undefined,
    report: WebMcpRegistrationReport
): Promise<boolean> {
    if (typeof context.registerTool !== "function") return false;
    const registerTool = context.registerTool.bind(context);

    const outcomes = await Promise.all(
        tools.map(async (tool) => {
            try {
                await registerTool(tool, { signal });
                return tool.name;
            } catch (error) {
                report.errors.push(`${surface}.registerTool(${tool.name}): ${String(error)}`);
                return null;
            }
        })
    );

    const registered = outcomes.filter((name): name is string => name !== null);
    if (registered.length === 0) return false;

    report.surfaces.push({ surface, method: "registerTool", tools: registered });
    return true;
}

/**
 * Déclare l'ensemble des outils d'un bloc via `provideContext`, la forme de
 * l'early preview Chrome. Elle ne connaît pas d'`AbortSignal` : le retrait se
 * fait en redéclarant un jeu d'outils vide.
 */
async function provideAllTools(
    surface: WebMcpSurface,
    context: ModelContextLike,
    tools: WebMcpTool[],
    signal: AbortSignal | undefined,
    report: WebMcpRegistrationReport
): Promise<void> {
    if (typeof context.provideContext !== "function") return;
    const provideContext = context.provideContext.bind(context);

    const clear = () => {
        try {
            void Promise.resolve(provideContext({ tools: [] })).catch((error) => {
                console.error("[WebMCP] Retrait des outils refusé :", error);
            });
        } catch (error) {
            console.error("[WebMCP] Retrait des outils impossible :", error);
        }
    };

    try {
        await provideContext({ tools });
    } catch (error) {
        report.errors.push(`${surface}.provideContext: ${String(error)}`);
        return;
    }

    // Le signal a pu se déclencher pendant la déclaration : `addEventListener`
    // ne rappellerait alors jamais, et les outils resteraient exposés.
    if (signal?.aborted) {
        clear();
        return;
    }

    report.surfaces.push({ surface, method: "provideContext", tools: tools.map((tool) => tool.name) });
    signal?.addEventListener("abort", clear, { once: true });
}

/**
 * Déclare les outils auprès de toutes les implémentations WebMCP présentes.
 *
 * Deux formes d'API coexistent aujourd'hui : `registerTool`, préférée parce
 * qu'elle porte le signal de retrait, et `provideContext` en repli — y compris
 * quand `registerTool` existe mais refuse tous les outils, plutôt que de
 * laisser la page sans rien.
 *
 * Une surface qui échoue n'empêche pas les autres : la fonction ne rejette
 * jamais, elle rend compte de ce qui a été déclaré. Sur un navigateur sans
 * WebMCP, `surfaces` est simplement vide.
 */
export async function registerWebMcpTools(
    tools: WebMcpTool[],
    options: RegisterWebMcpToolsOptions = {}
): Promise<WebMcpRegistrationReport> {
    const { signal } = options;
    const report: WebMcpRegistrationReport = { surfaces: [], errors: [] };

    if (signal?.aborted) return report;

    for (const { surface, context } of findModelContexts(options.scope ?? defaultScope())) {
        const registered = await registerToolByTool(surface, context, tools, signal, report);
        if (registered) continue;

        await provideAllTools(surface, context, tools, signal, report);
    }

    return report;
}
