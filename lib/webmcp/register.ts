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
 * Déclare les outils auprès de toutes les implémentations WebMCP présentes.
 *
 * Deux formes d'API coexistent aujourd'hui et sont gérées dans cet ordre :
 *
 * 1. `registerTool(tool, { signal })` — la spécification. Chaque outil est
 *    déclaré séparément et l'`AbortSignal` le retire, ce qui permet de suivre
 *    la navigation client (les outils d'une page démontée disparaissent).
 * 2. `provideContext({ tools })` — l'early preview Chrome, qui remplace d'un
 *    bloc l'ensemble des outils de la page. Le retrait passe alors par un
 *    second appel avec une liste vide.
 *
 * Une surface qui échoue n'empêche pas les autres : la fonction ne lève jamais,
 * elle rend compte de ce qui a été déclaré. Sur un navigateur sans WebMCP,
 * `surfaces` est simplement vide.
 */
export function registerWebMcpTools(
    tools: WebMcpTool[],
    options: RegisterWebMcpToolsOptions = {}
): WebMcpRegistrationReport {
    const { signal } = options;
    const report: WebMcpRegistrationReport = { surfaces: [], errors: [] };

    if (signal?.aborted) return report;

    for (const { surface, context } of findModelContexts(options.scope ?? defaultScope())) {
        if (typeof context.registerTool === "function") {
            const registered: string[] = [];
            for (const tool of tools) {
                try {
                    // La promesse renvoyée se résout après notification des
                    // agents : rien à attendre ici, mais un rejet ne doit pas
                    // remonter en « unhandled rejection ».
                    const result = context.registerTool(tool, { signal });
                    void Promise.resolve(result).catch((error) => {
                        console.error(`[WebMCP] Enregistrement de l'outil "${tool.name}" refusé :`, error);
                    });
                    registered.push(tool.name);
                } catch (error) {
                    report.errors.push(`${surface}.registerTool(${tool.name}): ${String(error)}`);
                }
            }

            if (registered.length > 0) {
                report.surfaces.push({ surface, method: "registerTool", tools: registered });
                continue;
            }
            // Aucun outil accepté : on retombe sur `provideContext` si l'objet
            // le porte aussi, plutôt que de laisser la page sans outil.
        }

        if (typeof context.provideContext === "function") {
            const provideContext = context.provideContext.bind(context);
            try {
                void Promise.resolve(provideContext({ tools })).catch((error) => {
                    console.error("[WebMCP] Déclaration des outils refusée :", error);
                });
                report.surfaces.push({ surface, method: "provideContext", tools: tools.map((tool) => tool.name) });

                // `provideContext` ne connaît pas d'`AbortSignal` : le retrait
                // se fait en redéclarant un jeu d'outils vide.
                signal?.addEventListener(
                    "abort",
                    () => {
                        try {
                            void Promise.resolve(provideContext({ tools: [] })).catch(() => {});
                        } catch (error) {
                            console.error("[WebMCP] Retrait des outils impossible :", error);
                        }
                    },
                    { once: true }
                );
            } catch (error) {
                report.errors.push(`${surface}.provideContext: ${String(error)}`);
            }
        }
    }

    return report;
}
