/**
 * Typage de l'API WebMCP (https://webmachinelearning.github.io/webmcp/).
 *
 * L'API n'est pas encore dans les lib DOM de TypeScript, et elle est exposée
 * sous deux formes selon les navigateurs : `document.modelContext` (brouillon
 * de spécification) et `navigator.modelContext` (early preview Chrome). Les
 * deux sont déclarées ici en optionnel — rien ne garantit leur présence, et le
 * code appelant doit toujours tester avant d'appeler.
 */

/** Schéma JSON d'entrée d'un outil (draft 2020-12, tel qu'attendu par MCP). */
export type JsonSchema = {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
};

/** Bloc de contenu renvoyé par un outil (seul le texte est utilisé ici). */
export type WebMcpTextContent = {
    type: "text";
    text: string;
};

/** Résultat d'un appel d'outil, au format MCP. */
export type WebMcpToolResult = {
    content: WebMcpTextContent[];
    isError?: boolean;
};

/**
 * Métadonnées facultatives d'un outil.
 *
 * `untrustedContentHint` signale à l'agent que le résultat peut contenir du
 * contenu rédigé par des tiers (noms d'événements, de lieux, texte de cartes) :
 * il ne doit pas être lu comme une instruction. Voir la section « Output
 * Injection Attacks » de la spécification.
 */
export type WebMcpToolAnnotations = {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
};

/** Définition d'un outil exposé à un agent. */
export type WebMcpTool = {
    name: string;
    title?: string;
    description: string;
    inputSchema: JsonSchema;
    annotations?: WebMcpToolAnnotations;
    execute: (input: Record<string, unknown>) => Promise<WebMcpToolResult>;
};

export type WebMcpRegisterToolOptions = {
    signal?: AbortSignal;
    exposedTo?: string[];
};

/**
 * Objet `modelContext`, quelle que soit la surface qui le porte. Les deux
 * méthodes sont optionnelles : `registerTool` déclare un outil à la fois (et
 * accepte un `AbortSignal` pour le retirer), `provideContext` remplace
 * l'ensemble des outils de la page d'un coup.
 */
export type ModelContextLike = {
    registerTool?: (tool: WebMcpTool, options?: WebMcpRegisterToolOptions) => unknown;
    provideContext?: (context: { tools: WebMcpTool[] }) => unknown;
};

declare global {
    interface Navigator {
        readonly modelContext?: ModelContextLike;
    }

    interface Document {
        readonly modelContext?: ModelContextLike;
    }
}
