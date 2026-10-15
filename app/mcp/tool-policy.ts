import type {
    CallToolResult,
    McpServer,
    ServerContext,
    ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";

/**
 * Ce que chaque outil MCP exige et ce qu'il touche, en un seul tableau.
 *
 * Avant, l'information était éparpillée : quelques descriptions disaient
 * « réservé aux organisateurs », la plupart ne disaient rien, et un client ne
 * pouvait savoir qu'un outil demandait un compte qu'en l'appelant. Ici, chaque
 * outil déclare deux choses, et tout le reste en découle :
 *
 * - `access` — qui peut l'appeler. Devient le `_meta.securitySchemes` de
 *   l'outil, une phrase à la fin de sa description, le refus d'un appel
 *   anonyme dans `registerJoutesTool`, et le 401 que `route.ts` renvoie avant
 *   même d'ouvrir le serveur.
 * - `effect` — ce qu'il fait aux données. Devient les annotations du
 *   protocole (`readOnlyHint`, `destructiveHint`, `idempotentHint`), sur
 *   lesquelles les clients décident de demander confirmation ou non.
 *
 * Un outil absent du tableau ne s'enregistre pas : le type de `name` dans
 * `registerJoutesTool` l'interdit à la compilation.
 */

/**
 * - `public` : répond à tous, jeton ou non, et pareil pour tous.
 * - `optional` : répond sans jeton ; avec, il voit en plus ce que l'utilisateur
 *   a le droit de voir (agenda personnalisé, wishlist privée).
 * - `account` : exige un compte Joutes (clé API `jts_…` ou jeton OAuth). Les
 *   droits plus fins — propriétaire du lieu, organisateur du tournoi,
 *   modérateur des erratas — restent vérifiés par l'outil lui-même.
 */
export type ToolAccess = "public" | "optional" | "account";

/**
 * - `read` : ne modifie rien.
 * - `create` : ajoute sans rien écraser.
 * - `update` : écrase des valeurs existantes.
 * - `delete` : retire des données.
 */
export type ToolEffect = "read" | "create" | "update" | "delete";

export type ToolPolicy = {
    access: ToolAccess;
    effect: ToolEffect;
    /**
     * Rappeler l'outil avec les mêmes arguments ne change rien de plus.
     * Par défaut : vrai pour `update`, faux pour `create` et `delete`.
     */
    idempotent?: boolean;
    /** L'outil va chercher des données hors de Joutes (défaut : non). */
    openWorld?: boolean;
};

export const TOOL_POLICIES = {
    // Évènements, lieux, jeux
    search_events: { access: "optional", effect: "read" },
    search_lairs: { access: "public", effect: "read" },
    list_games: { access: "public", effect: "read" },
    create_event: { access: "account", effect: "create" },
    follow_lair: { access: "account", effect: "create", idempotent: true },
    add_game: { access: "account", effect: "create", idempotent: true },

    // Cartes, règles, erratas
    search_card: { access: "public", effect: "read" },
    search_rules: { access: "public", effect: "read" },
    get_rule: { access: "public", effect: "read" },
    check_deck: { access: "public", effect: "read", openWorld: true },
    create_errata: { access: "account", effect: "create" },
    update_errata: { access: "account", effect: "update" },
    vote_errata: { access: "account", effect: "update" },

    // Collection
    get_collection: { access: "account", effect: "read" },
    add_card_to_collection: { access: "account", effect: "create" },
    remove_card_from_collection: { access: "account", effect: "delete" },

    // Wishlists
    list_wishlists: { access: "account", effect: "read" },
    get_wishlist: { access: "optional", effect: "read" },
    create_wishlist: { access: "account", effect: "create" },
    add_card_to_wishlist: { access: "account", effect: "create" },
    remove_card_from_wishlist: { access: "account", effect: "delete" },

    // Groupes de jeu
    list_play_groups: { access: "account", effect: "read" },
    create_play_group: { access: "account", effect: "create" },
    invite_to_play_group: { access: "account", effect: "create" },

    // Tournois
    list_tournaments: { access: "account", effect: "read" },
    get_tournament: { access: "account", effect: "read" },
    create_tournament: { access: "account", effect: "create" },
    update_tournament: { access: "account", effect: "update" },
    add_tournament_player: { access: "account", effect: "create" },
} as const satisfies Record<string, ToolPolicy>;

export type JoutesToolName = keyof typeof TOOL_POLICIES;

/** Les outils qu'un appel anonyme ne peut pas atteindre. */
export function requiresAccount(toolName: string): boolean {
    const policy = (TOOL_POLICIES as Record<string, ToolPolicy>)[toolName];
    return policy?.access === "account";
}

/**
 * Les annotations du protocole. `destructiveHint` et `idempotentHint` ne
 * valent que pour un outil qui écrit : sur un outil en lecture seule, la
 * spécification dit de les ignorer, on ne les émet donc pas.
 */
export function toolAnnotations(policy: ToolPolicy): ToolAnnotations {
    const openWorldHint = policy.openWorld ?? false;
    if (policy.effect === "read") {
        return { readOnlyHint: true, openWorldHint };
    }
    return {
        readOnlyHint: false,
        destructiveHint: policy.effect === "update" || policy.effect === "delete",
        idempotentHint: policy.idempotent ?? policy.effect === "update",
        openWorldHint,
    };
}

/**
 * `securitySchemes`, la convention que lisent les clients pour savoir s'ils
 * doivent connecter l'utilisateur avant d'appeler l'outil : `noauth` seul,
 * `oauth2` seul, ou les deux quand la connexion est facultative. La clé API
 * se présente comme un jeton OAuth, en `Authorization: Bearer`.
 */
export function toolSecuritySchemes(access: ToolAccess) {
    switch (access) {
        case "public":
            return [{ type: "noauth" }];
        case "optional":
            return [{ type: "noauth" }, { type: "oauth2" }];
        case "account":
            return [{ type: "oauth2" }];
    }
}

const ACCESS_NOTE: Record<ToolAccess, string | null> = {
    public: null,
    optional: "Connexion facultative : connecté, l'outil tient compte du compte de l'utilisateur.",
    account: "Nécessite un compte Joutes connecté.",
};

export type ToolResult = CallToolResult;

export const AUTH_REQUIRED: ToolResult = {
    content: [{ type: "text", text: "Authentification requise pour utiliser cet outil." }],
    isError: true,
};

export function userIdFrom(ctx: ServerContext): string | undefined {
    return ctx.http?.authInfo?.extra?.userId as string | undefined;
}

/**
 * Enregistre un outil avec ce que dit sa politique : annotations, schémas de
 * sécurité, mention de la connexion dans la description, et refus de l'appel
 * anonyme pour un outil `account`.
 */
export function registerJoutesTool<Shape extends z.ZodRawShape>(
    server: McpServer,
    name: JoutesToolName,
    config: { title: string; description: string; inputSchema: Shape },
    handler: (args: z.output<z.ZodObject<Shape>>, ctx: ServerContext) => Promise<ToolResult>,
): void {
    const policy: ToolPolicy = TOOL_POLICIES[name];
    const note = ACCESS_NOTE[policy.access];

    server.registerTool(name, {
        title: config.title,
        description: note ? `${config.description}\n\n${note}` : config.description,
        inputSchema: z.object(config.inputSchema),
        annotations: { title: config.title, ...toolAnnotations(policy) },
        _meta: { securitySchemes: toolSecuritySchemes(policy.access) },
    }, async (args, ctx) => {
        if (policy.access === "account" && !userIdFrom(ctx)) return AUTH_REQUIRED;
        return handler(args as z.output<z.ZodObject<Shape>>, ctx);
    });
}
