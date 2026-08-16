import { DateTime } from "luxon";
import type { JsonSchema, WebMcpTool, WebMcpToolResult } from "@/lib/webmcp/types";

/**
 * Outils WebMCP de Joutes : ce qu'un agent ouvrant une page du site peut faire
 * pour l'utilisateur, sans avoir à lire le DOM ni à cliquer.
 *
 * Ils tapent les mêmes routes `/api` que l'interface, depuis l'onglet de
 * l'utilisateur : la session (cookie) et donc ses droits sont ceux de la page.
 * Un outil ne rend jamais plus que ce que l'utilisateur verrait lui-même.
 *
 * Le pendant serveur de ces outils vit dans `app/mcp` : il sert les agents qui
 * se connectent en HTTP avec une clé d'API, quand ceux-ci n'ont pas de
 * navigateur. Les deux jeux d'outils se recoupent volontairement.
 */

/** Ce dont les outils ont besoin du navigateur, injectable pour les tests. */
export type WebMcpToolDeps = {
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
    /** Navigation interne (routeur Next), sans rechargement complet. */
    navigate: (path: string) => void;
    currentPage: () => { url: string; path: string; title: string };
};

/** Nombre de résultats rendus par défaut : de quoi choisir, pas de quoi noyer. */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function textResult(text: string): WebMcpToolResult {
    return { content: [{ type: "text", text }] };
}

function errorResult(text: string): WebMcpToolResult {
    return { content: [{ type: "text", text }], isError: true };
}

function readString(input: Record<string, unknown>, key: string): string | undefined {
    const value = input[key];
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(input: Record<string, unknown>, key: string): number | undefined {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // Un agent peut passer un nombre sous forme de chaîne : le schéma le dit
    // `number`, mais rien ne l'y oblige côté navigateur.
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function readLimit(input: Record<string, unknown>): number {
    const limit = readNumber(input, "limit");
    if (limit === undefined) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

/** Résultat d'un `fetch` interne : le corps JSON, ou un message d'erreur. */
async function fetchJson<T>(
    deps: WebMcpToolDeps,
    path: string
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
    let response: Response;
    try {
        response = await deps.fetch(path, { headers: { Accept: "application/json" } });
    } catch (error) {
        console.error(`[WebMCP] Requête ${path} échouée :`, error);
        return { ok: false, message: "Le site n'a pas répondu. Réessayez dans un instant." };
    }

    if (response.status === 401 || response.status === 403) {
        return { ok: false, message: "Cette information demande d'être connecté sur joutes.app." };
    }
    if (!response.ok) {
        return { ok: false, message: `Le site a répondu ${response.status}.` };
    }

    try {
        return { ok: true, data: (await response.json()) as T };
    } catch {
        return { ok: false, message: "Réponse illisible du site." };
    }
}

function formatList(title: string, lines: string[], emptyMessage: string): WebMcpToolResult {
    if (lines.length === 0) return textResult(emptyMessage);
    return textResult(`${title}\n\n${lines.join("\n")}`);
}

/**
 * Chemin interne sûr : seuls les chemins absolus du site sont acceptés. Un
 * agent ne peut donc pas se servir de l'outil de navigation pour envoyer
 * l'utilisateur vers `https://ailleurs.example` ou un `javascript:`.
 */
export function sanitizeInternalPath(rawPath: string): string | null {
    const path = rawPath.trim();
    if (!path.startsWith("/")) return null;
    // `//host` est un chemin protocole-relatif : il sort du site.
    if (path.startsWith("//")) return null;
    if (path.includes("\\")) return null;
    return path;
}

// --- Schémas d'entrée ---

const searchJoutesSchema: JsonSchema = {
    type: "object",
    properties: {
        query: {
            type: "string",
            description: "Termes recherchés (au moins 2 caractères).",
            minLength: 2,
        },
    },
    required: ["query"],
    additionalProperties: false,
};

const listGamesSchema: JsonSchema = {
    type: "object",
    properties: {},
    additionalProperties: false,
};

const searchCardsSchema: JsonSchema = {
    type: "object",
    properties: {
        game: {
            type: "string",
            description: "Slug du jeu, tel que rendu par list_games (par exemple « riftbound »).",
        },
        query: {
            type: "string",
            description:
                "Recherche sur le nom et le texte des cartes. La syntaxe du site est acceptée (« set:OGN », « type:Unit », « energy<=3 »).",
        },
        lang: {
            type: "string",
            description: "Code de langue des impressions (« fr », « en »…). Toutes langues par défaut.",
        },
        limit: {
            type: "number",
            description: `Nombre de cartes rendues (1 à ${MAX_LIMIT}, ${DEFAULT_LIMIT} par défaut).`,
        },
    },
    required: ["game"],
    additionalProperties: false,
};

const searchEventsSchema: JsonSchema = {
    type: "object",
    properties: {
        gameId: {
            type: "string",
            description:
                "Slug d'un jeu pour ne garder que ses événements, « followed » pour les jeux suivis (défaut), « all » pour tous.",
        },
        month: { type: "number", description: "Mois (1-12). Mois courant par défaut." },
        year: { type: "number", description: "Année. Année courante par défaut." },
        latitude: { type: "number", description: "Latitude du point de recherche." },
        longitude: { type: "number", description: "Longitude du point de recherche." },
        maxDistanceKm: {
            type: "number",
            description: "Rayon de recherche en kilomètres autour du point donné.",
        },
        limit: {
            type: "number",
            description: `Nombre d'événements rendus (1 à ${MAX_LIMIT}, ${DEFAULT_LIMIT} par défaut).`,
        },
    },
    additionalProperties: false,
};

const searchLairsSchema: JsonSchema = {
    type: "object",
    properties: {
        query: { type: "string", description: "Recherche sur le nom du lieu." },
        gameId: { type: "string", description: "Ne garder que les lieux qui accueillent ce jeu." },
        limit: {
            type: "number",
            description: `Nombre de lieux rendus (1 à ${MAX_LIMIT}, ${DEFAULT_LIMIT} par défaut).`,
        },
    },
    additionalProperties: false,
};

const navigateSchema: JsonSchema = {
    type: "object",
    properties: {
        path: {
            type: "string",
            description:
                "Chemin interne au site, commençant par « / » (par exemple « /events », « /games/riftbound/cards », « /tournaments »).",
        },
    },
    required: ["path"],
    additionalProperties: false,
};

const currentPageSchema: JsonSchema = {
    type: "object",
    properties: {},
    additionalProperties: false,
};

// --- Types des réponses d'API consommées ---

type SearchApiResult = { label: string; sublabel?: string; href: string };
type SearchApiResponse = {
    games: SearchApiResult[];
    cards: SearchApiResult[];
    lairs: SearchApiResult[];
    events: SearchApiResult[];
    rules: SearchApiResult[];
};

type GameSummary = { name: string; slug?: string; id?: string; type?: string; description?: string };

type CardSummary = {
    name?: string;
    id?: string;
    set?: string;
    setCode?: string;
    collector_number?: string;
    type?: string;
    lang?: string;
};
type CardsApiResponse = { cards: CardSummary[]; total: number };

type EventSummary = {
    id: string;
    name: string;
    gameName?: string;
    startDateTime: string;
    price?: number;
    lair?: { id: string; name: string; address?: string };
};
type EventsApiResponse = { events: EventSummary[] };

type LairSummary = { id: string; name: string; address?: string; website?: string };
type LairsApiResponse = { lairs: LairSummary[]; total: number };

// --- Outils ---

function formatDate(iso: string): string {
    const date = DateTime.fromISO(iso);
    return date.isValid ? date.setLocale("fr").toFormat("cccc d LLLL yyyy, HH:mm") : iso;
}

function searchJoutesTool(deps: WebMcpToolDeps): WebMcpTool {
    return {
        name: "search_joutes",
        title: "Search Joutes",
        description:
            "Rechercher partout sur Joutes en une fois : jeux, cartes, lieux de jeu, événements, règles et policies. Point d'entrée à privilégier quand on ne sait pas encore dans quelle rubrique se trouve la réponse.",
        inputSchema: searchJoutesSchema,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
            const query = readString(input, "query");
            if (!query || query.length < 2) {
                return errorResult("Indiquez une recherche d'au moins 2 caractères.");
            }

            const result = await fetchJson<SearchApiResponse>(deps, `/api/search?q=${encodeURIComponent(query)}`);
            if (!result.ok) return errorResult(result.message);

            const sections: [string, SearchApiResult[]][] = [
                ["Jeux", result.data.games],
                ["Cartes", result.data.cards],
                ["Lieux", result.data.lairs],
                ["Événements", result.data.events],
                ["Règles et policies", result.data.rules],
            ];

            const lines = sections.flatMap(([label, entries]) =>
                entries.length === 0
                    ? []
                    : [
                          `**${label}**`,
                          ...entries.map(
                              (entry) =>
                                  `- ${entry.label}${entry.sublabel ? ` — ${entry.sublabel}` : ""} (${entry.href})`
                          ),
                          "",
                      ]
            );

            return formatList(`Résultats pour « ${query} » :`, lines, `Aucun résultat pour « ${query} ».`);
        },
    };
}

function listGamesTool(deps: WebMcpToolDeps): WebMcpTool {
    return {
        name: "list_games",
        title: "List games",
        description:
            "Lister les jeux suivis par Joutes (jeux de cartes à collectionner, jeux de figurines, jeux de société) avec leur slug, à reprendre dans les autres outils.",
        inputSchema: listGamesSchema,
        annotations: { readOnlyHint: true },
        execute: async () => {
            const result = await fetchJson<GameSummary[]>(deps, "/api/games");
            if (!result.ok) return errorResult(result.message);

            const games = Array.isArray(result.data) ? result.data : [];
            const lines = games.map((game) => {
                const slug = game.slug ?? game.id;
                return `- ${game.name}${slug ? ` (slug: ${slug})` : ""}${game.type ? ` — ${game.type}` : ""}`;
            });

            return formatList("Jeux disponibles sur Joutes :", lines, "Aucun jeu n'est disponible.");
        },
    };
}

function searchCardsTool(deps: WebMcpToolDeps): WebMcpTool {
    return {
        name: "search_cards",
        title: "Search cards",
        description:
            "Chercher des cartes dans le catalogue d'un jeu, par nom ou par texte, avec la syntaxe de filtres du site. Le slug du jeu se récupère avec list_games.",
        inputSchema: searchCardsSchema,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
            const game = readString(input, "game");
            if (!game) return errorResult("Indiquez le slug du jeu (voir list_games).");

            const limit = readLimit(input);
            const params = new URLSearchParams({ page: "1", limit: String(limit) });
            const query = readString(input, "query");
            if (query) params.set("searchQuery", query);
            params.set("lang", readString(input, "lang") ?? "all");

            const result = await fetchJson<CardsApiResponse>(
                deps,
                `/api/games/${encodeURIComponent(game)}/cards?${params.toString()}`
            );
            if (!result.ok) return errorResult(result.message);

            const cards = result.data.cards ?? [];
            const lines = cards.map((card) => {
                const set = card.setCode ?? card.set;
                const details = [set, card.collector_number, card.type, card.lang].filter(Boolean).join(" · ");
                const href = card.id ? ` (/games/${game}/cards/${card.id})` : "";
                return `- ${card.name ?? "Sans nom"}${details ? ` — ${details}` : ""}${href}`;
            });

            const header = `${result.data.total ?? cards.length} carte(s) trouvée(s) pour « ${query ?? "tout le catalogue"} » dans ${game}${
                cards.length < (result.data.total ?? 0) ? `, ${cards.length} affichée(s)` : ""
            } :`;

            return formatList(header, lines, `Aucune carte ne correspond dans ${game}.`);
        },
    };
}

function searchEventsTool(deps: WebMcpToolDeps): WebMcpTool {
    return {
        name: "search_events",
        title: "Search events",
        description:
            "Lister les événements et tournois organisés (dates, lieu, jeu, prix). Sans être connecté, précisez latitude, longitude et maxDistanceKm pour chercher autour d'un point ; connecté, la recherche porte par défaut sur les jeux et lieux suivis.",
        inputSchema: searchEventsSchema,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
            const now = DateTime.now();
            const params = new URLSearchParams({
                gameId: readString(input, "gameId") ?? "followed",
                month: String(readNumber(input, "month") ?? now.month),
                year: String(readNumber(input, "year") ?? now.year),
            });

            const latitude = readNumber(input, "latitude");
            const longitude = readNumber(input, "longitude");
            if (latitude !== undefined && longitude !== undefined) {
                params.set("userLat", String(latitude));
                params.set("userLon", String(longitude));
                params.set("maxDistance", String(readNumber(input, "maxDistanceKm") ?? 50));
            }

            const result = await fetchJson<EventsApiResponse>(deps, `/api/events?${params.toString()}`);
            if (!result.ok) return errorResult(result.message);

            const events = (result.data.events ?? []).slice(0, readLimit(input));
            const lines = events.map((event) => {
                const place = event.lair?.name ?? "Lieu non précisé";
                const price = event.price ? `${event.price} €` : "Gratuit";
                return `- ${event.name} — ${event.gameName ?? "jeu non précisé"} — ${formatDate(event.startDateTime)} — ${place} — ${price} (/events/${event.id})`;
            });

            return formatList(
                "Événements trouvés :",
                lines,
                "Aucun événement trouvé. Sans compte connecté, une position (latitude, longitude, maxDistanceKm) est nécessaire pour obtenir des résultats."
            );
        },
    };
}

function searchLairsTool(deps: WebMcpToolDeps): WebMcpTool {
    return {
        name: "search_lairs",
        title: "Search venues",
        description:
            "Chercher des lieux de jeu (boutiques, clubs, associations) référencés sur Joutes, par nom ou par jeu accueilli.",
        inputSchema: searchLairsSchema,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
            const limit = readLimit(input);
            const params = new URLSearchParams({ page: "1", limit: String(limit) });
            const query = readString(input, "query");
            if (query) params.set("search", query);
            const gameId = readString(input, "gameId");
            if (gameId) params.set("gameId", gameId);

            const result = await fetchJson<LairsApiResponse>(deps, `/api/lairs?${params.toString()}`);
            if (!result.ok) return errorResult(result.message);

            const lairs = result.data.lairs ?? [];
            const lines = lairs.map(
                (lair) => `- ${lair.name}${lair.address ? ` — ${lair.address}` : ""} (/lairs/${lair.id})`
            );

            return formatList(`${result.data.total ?? lairs.length} lieu(x) trouvé(s) :`, lines, "Aucun lieu trouvé.");
        },
    };
}

function navigateTool(deps: WebMcpToolDeps): WebMcpTool {
    return {
        name: "navigate_joutes",
        title: "Open a Joutes page",
        description:
            "Ouvrir une page de Joutes dans l'onglet courant, pour montrer un résultat à l'utilisateur ou poursuivre dans l'interface. N'accepte que des chemins internes au site, commençant par « / ».",
        inputSchema: navigateSchema,
        annotations: { readOnlyHint: false },
        execute: async (input) => {
            const rawPath = readString(input, "path");
            if (!rawPath) return errorResult("Indiquez le chemin de la page à ouvrir.");

            const path = sanitizeInternalPath(rawPath);
            if (!path) {
                return errorResult(
                    "Seules les pages de joutes.app sont accessibles : donnez un chemin interne commençant par « / »."
                );
            }

            deps.navigate(path);
            return textResult(`Page ${path} ouverte.`);
        },
    };
}

function currentPageTool(deps: WebMcpToolDeps): WebMcpTool {
    return {
        name: "get_current_page",
        title: "Get current page",
        description:
            "Savoir quelle page de Joutes l'utilisateur regarde (adresse et titre), pour raisonner sur ce qu'il a sous les yeux avant d'agir.",
        inputSchema: currentPageSchema,
        annotations: { readOnlyHint: true },
        execute: async () => {
            const page = deps.currentPage();
            return textResult(`Page courante : ${page.title}\n- Adresse : ${page.url}\n- Chemin : ${page.path}`);
        },
    };
}

/** Le jeu d'outils exposé par toutes les pages du site. */
export function createJoutesWebMcpTools(deps: WebMcpToolDeps): WebMcpTool[] {
    return [
        searchJoutesTool(deps),
        listGamesTool(deps),
        searchCardsTool(deps),
        searchEventsTool(deps),
        searchLairsTool(deps),
        navigateTool(deps),
        currentPageTool(deps),
    ];
}
