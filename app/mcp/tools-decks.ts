import { z } from "zod";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { revalidatePath } from "next/cache";

import { createDeck, getDeckById, searchDecks, updateDeck } from "@/lib/db/decks";
import { getDeckCardInfos, resolveCardIdsByName, searchDeckCards } from "@/lib/db/deck-cards";
import { getGameById } from "@/lib/db/games";
import { getOwnershipByName } from "@/lib/db/collection";
import { getDeckCollectionCounts } from "@/lib/decks/collection";
import { deckCardIds, type DeckCards } from "@/lib/decks/contents";
import { routeCardToZone } from "@/lib/decks/routing";
import { applyDeckText, combineDeckCards, normalizeCardName, parseDeckText, stringifyDeckText } from "@/lib/decks/text";
import { defaultDeckZone, getDeckZones } from "@/lib/decks/zones";
import { deckCardsSchema, deckVisibilitySchema } from "@/lib/schemas/deck.schema";
import { linkLine, mcpLinks } from "@/lib/mcp/links";
import {
    applyDeckChanges,
    deckEditorDeck,
    deckEditorSummary,
    describeChanges,
    describeDeck,
    describeDeckList,
} from "@/lib/mcp/decks";
import type { Deck } from "@/lib/types/Deck";
import type { Game } from "@/lib/types/Game";
import {
    DECK_EDITOR_VIEW_URI,
    type DeckChangesResult,
    type DeckEditorDeck,
    type DeckEditorResult,
    type DeckEditorSaveResult,
    type DeckEditorSearchResult,
} from "@/mcp-apps/deck-editor/result";
import { DECK_EDITOR_VIEW_HTML } from "./apps/deck-editor.generated";
import { CARD_IMAGE_DOMAINS, errorResult, resolveGame, withToolLogging } from "./tools";
import { registerJoutesTool, userIdFrom, type ToolResult } from "./tool-policy";

/*
  Les decks de l'utilisateur, et l'éditeur de deck que les clients MCP Apps
  (Claude, ChatGPT…) affichent sous la réponse ou en panneau.

  Trois sortes d'outils :
  - pour le modèle, en texte : list_my_decks, get_deck, create_deck,
    update_deck_cards, et open_deck_editor qui ouvre la vue ;
  - pour la vue seule (`visibility: ["app"]`) : la recherche de cartes et
    l'enregistrement de ce que l'utilisateur fait à la main, sans demande
    d'accord à chaque carte, comme sur le site ;
  - les outils que la vue elle-même donne au modèle quand elle est ouverte
    (mcp-apps/deck-editor/main.tsx) passent par update_deck_cards : Claude
    modifie le deck affiché, après l'accord de l'utilisateur.
*/

const deckIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Identifiant de deck invalide");

function revalidateDeck(deckId: string) {
    // Hors d'une requête Next (tests), la revalidation n'a rien à faire.
    try {
        revalidatePath("/decks");
        revalidatePath(`/decks/${deckId}`);
        revalidatePath(`/decks/${deckId}/edit`);
    } catch {
        /* rien à revalider */
    }
}

/** Le deck de l'utilisateur désigné par identifiant ou par nom. */
async function findOwnDeck(
    userId: string,
    { deckId, deckName }: { deckId?: string; deckName?: string },
): Promise<{ deck: Deck } | { error: ToolResult }> {
    if (deckId) {
        const deck = deckIdSchema.safeParse(deckId).success ? await getDeckById(deckId) : null;
        if (!deck || deck.playerId !== userId) {
            return { error: errorResult("Deck introuvable parmi vos decks. `list_my_decks` donne leurs identifiants.") };
        }
        return { deck };
    }
    if (deckName) {
        const { decks } = await searchDecks({ scope: "mine", viewerId: userId, search: deckName, limit: 10 });
        const target = normalizeCardName(deckName);
        const exact = decks.find((deck) => normalizeCardName(deck.name) === target);
        if (exact) return { deck: exact };
        if (decks.length === 1) return { deck: decks[0] };
        if (decks.length === 0) return { error: errorResult(`Aucun de vos decks ne s'appelle « ${deckName} ».`) };
        return { error: errorResult(`Plusieurs decks correspondent à « ${deckName} » :\n${decks.map((d) => `- ${d.name} (ID: ${d.id})`).join("\n")}`) };
    }
    return { error: errorResult("Indiquez le deck : `deckId` ou `deckName`.") };
}

/** Le deck tel que la vue l'édite, avec le catalogue de ses cartes et la collection de l'utilisateur. */
async function loadEditorDeck(deck: Deck, userId: string, game?: Game | null): Promise<DeckEditorDeck> {
    const resolvedGame = game === undefined ? await getGameById(deck.gameId) : game;
    const zones = getDeckZones(resolvedGame);
    const catalog = await getDeckCardInfos(deck.gameId, deckCardIds(deck.cards));
    const owned = await getDeckCollectionCounts(userId, deck.gameId, deck.cards, new Map(catalog.map((card) => [card.id, card])));
    return deckEditorDeck(deck, resolvedGame, zones, catalog, owned, {
        url: mcpLinks.deck(deck.id),
        editUrl: mcpLinks.deckEdit(deck.id),
    });
}

/** La liste « Mes decks », la plus récemment modifiée d'abord. */
async function loadDeckList(userId: string, args: { gameName?: string; search?: string; limit?: number }) {
    let gameId: string | undefined;
    if (args.gameName) {
        const game = await resolveGame(args.gameName);
        if (!game) return { error: errorResult(`Jeu « ${args.gameName} » introuvable.`) };
        gameId = game._id.toString();
    }

    const { decks, total } = await searchDecks({
        scope: "mine",
        viewerId: userId,
        gameId,
        search: args.search,
        sortBy: "updatedAt",
        sortOrder: "desc",
        limit: args.limit ?? 50,
    });

    const games = new Map<string, Game | null>();
    for (const id of new Set(decks.map((deck) => deck.gameId))) {
        games.set(id, await getGameById(id));
    }

    const summaries = decks.map((deck) => {
        const game = games.get(deck.gameId);
        return deckEditorSummary(deck, game, getDeckZones(game));
    });
    const gameList = [...games.values()]
        .filter((game): game is Game => Boolean(game?.slug))
        .map((game) => ({ slug: game.slug!, name: game.name }));

    return { summaries, total, games: gameList };
}

function deckContent(cards: DeckCards, zones: ReturnType<typeof getDeckZones>, names: Map<string, string>) {
    // La liste texte suit le contenu structuré, comme à l'enregistrement de
    // l'éditeur du site : des écrans et des exports ne lisent qu'elle.
    return { cards, decklist: stringifyDeckText(cards, zones, (id) => names.get(id)) };
}

// --- Outils pour le modèle ---

async function handleListMyDecks(args: { gameName?: string; search?: string }, ctx: ServerContext): Promise<ToolResult> {
    const userId = userIdFrom(ctx)!;
    const list = await loadDeckList(userId, { ...args, limit: 25 });
    if ("error" in list) return list.error!;
    const result: DeckEditorResult = { mode: "list", decks: list.summaries, games: list.games };
    return {
        content: [{ type: "text", text: describeDeckList(list.summaries, list.total) + linkLine(mcpLinks.decks()) }],
        structuredContent: result,
    };
}

async function handleGetDeck(args: { deckId?: string; deckName?: string }, ctx: ServerContext): Promise<ToolResult> {
    const userId = userIdFrom(ctx)!;
    const found = await findOwnDeck(userId, args);
    if ("error" in found) return found.error;
    const deck = await loadEditorDeck(found.deck, userId);
    const result: DeckEditorResult = { mode: "deck", deck };
    return {
        content: [{ type: "text", text: describeDeck(deck) + linkLine(deck.url) }],
        structuredContent: result,
    };
}

async function handleCreateDeck(
    args: { gameName: string; name: string; deckList?: string; visibility?: "private" | "unlisted" | "public" },
    ctx: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(ctx)!;
    const game = await resolveGame(args.gameName);
    if (!game) return errorResult(`Jeu « ${args.gameName} » introuvable.`);
    const gameId = game._id.toString();
    const zones = getDeckZones(game);

    let cards: DeckCards = {};
    let unmatched: string[] = [];
    if (args.deckList?.trim()) {
        const parsed = parseDeckText(args.deckList, zones);
        const byName = await resolveCardIdsByName(gameId, [...new Set(parsed.lines.map((line) => line.name))]);
        const byId = new Map([...byName.values()].map((card) => [card.id, card]));
        const applied = applyDeckText(
            parsed,
            (name) => byName.get(normalizeCardName(name))?.id,
            (cardId, built) => {
                const card = byId.get(cardId);
                return card ? routeCardToZone(card, zones, combineDeckCards({}, built)) : defaultDeckZone(zones);
            },
        );
        cards = applied.cards;
        unmatched = applied.unmatched;
    }

    const catalog = await getDeckCardInfos(gameId, deckCardIds(cards));
    let created: Deck;
    try {
        created = await createDeck({
            playerId: userId,
            gameId,
            name: args.name.trim(),
            ...deckContent(cards, zones, new Map(catalog.map((card) => [card.id, card.name]))),
            visibility: args.visibility ?? "private",
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes("existe déjà")) {
            return errorResult(`Vous avez déjà un deck nommé « ${args.name} ».`);
        }
        throw error;
    }
    revalidateDeck(created.id);

    const deck = await loadEditorDeck(created, userId, { ...game, id: gameId } as Game);
    const missing = unmatched.length > 0 ? `\n\nCartes non reconnues, laissées de côté : ${unmatched.join(", ")}.` : "";
    const result: DeckEditorResult = { mode: "deck", deck };
    return {
        content: [{ type: "text", text: `Deck créé.\n\n${describeDeck(deck)}${missing}` + linkLine(deck.editUrl) }],
        structuredContent: result,
    };
}

const changeSchema = z.object({
    cardName: z.string().min(1).max(200).describe("Nom exact de la carte"),
    quantity: z.number().int().min(-99).max(99).describe("Exemplaires à ajouter (positif) ou à retirer (négatif)"),
    zone: z.string().max(60).optional().describe("Zone visée (« Deck principal », « Runes », « Réserve »…). Absente : la carte va là où son type la range, et un retrait part de la zone qui la porte."),
});

async function handleUpdateDeckCards(
    args: { deckId: string; changes: z.infer<typeof changeSchema>[]; expectedVersion?: number },
    ctx: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(ctx)!;
    const found = await findOwnDeck(userId, { deckId: args.deckId });
    if ("error" in found) return found.error;
    const before = found.deck;

    const game = await getGameById(before.gameId);
    const zones = getDeckZones(game);
    const byName = await resolveCardIdsByName(before.gameId, [...new Set(args.changes.map((change) => change.cardName.trim()))]);
    const outcome = applyDeckChanges(before.cards ?? {}, zones, args.changes, byName);

    let saved = before;
    if (outcome.applied.length > 0) {
        const catalog = await getDeckCardInfos(before.gameId, deckCardIds(outcome.cards));
        const update = await updateDeck(
            before.id,
            userId,
            deckContent(outcome.cards, zones, new Map(catalog.map((card) => [card.id, card.name]))),
            args.expectedVersion,
        );
        if (!update.ok) {
            return errorResult(update.error === "conflict"
                ? `Le deck a été enregistré ailleurs entre-temps (version ${update.deck.version}). Relisez-le avec \`get_deck\` avant de recommencer.`
                : "Deck introuvable parmi vos decks.");
        }
        saved = update.deck;
        revalidateDeck(saved.id);
    }

    const deck = await loadEditorDeck(saved, userId, game);
    const result: DeckChangesResult = {
        deck,
        previousCards: before.cards ?? {},
        applied: outcome.applied,
        skipped: outcome.skipped,
    };
    return {
        content: [{ type: "text", text: describeChanges({ ...outcome, cards: deck.cards }, deck) + linkLine(deck.editUrl) }],
        structuredContent: result,
        ...(outcome.applied.length === 0 && outcome.skipped.length > 0 && { isError: true }),
    };
}

async function handleOpenDeckEditor(
    args: { deckId?: string; deckName?: string; gameName?: string },
    ctx: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(ctx)!;
    if (args.deckId || args.deckName) {
        const found = await findOwnDeck(userId, args);
        if ("error" in found) return found.error;
        const deck = await loadEditorDeck(found.deck, userId);
        const result: DeckEditorResult = { mode: "deck", deck };
        return {
            content: [{
                type: "text",
                text: `L'éditeur affiche le deck. Ce que l'utilisateur y change est enregistré sur Joutes.\n\n${describeDeck(deck)}` + linkLine(deck.editUrl),
            }],
            structuredContent: result,
        };
    }

    const list = await loadDeckList(userId, { gameName: args.gameName });
    if ("error" in list) return list.error!;
    const result: DeckEditorResult = { mode: "list", decks: list.summaries, games: list.games };
    return {
        content: [{ type: "text", text: `L'éditeur affiche la liste des decks de l'utilisateur.\n\n${describeDeckList(list.summaries, list.total)}` }],
        structuredContent: result,
    };
}

// --- Outils réservés à la vue ---

async function handleSearchCards(
    args: { deckId: string; query: string; domain?: string },
    ctx: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(ctx)!;
    const found = await findOwnDeck(userId, { deckId: args.deckId });
    if ("error" in found) return found.error;

    const cards = await searchDeckCards(found.deck.gameId, args.query, { domain: args.domain });
    const snapshot = await getOwnershipByName({ type: "user", id: userId }, found.deck.gameId, cards.map((card) => card.name));
    const result: DeckEditorSearchResult = {
        cards: cards.map((card) => ({ ...card, owned: snapshot[card.name]?.total ?? 0 })),
        total: cards.length,
    };
    return {
        content: [{ type: "text", text: `${cards.length} carte(s) : ${cards.map((card) => card.name).join(", ")}` }],
        structuredContent: result,
    };
}

async function handleSave(
    args: { deckId: string; cards: DeckCards; expectedVersion?: number },
    ctx: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(ctx)!;
    const found = await findOwnDeck(userId, { deckId: args.deckId });
    if ("error" in found) return found.error;

    const game = await getGameById(found.deck.gameId);
    const zones = getDeckZones(game);
    const catalog = await getDeckCardInfos(found.deck.gameId, deckCardIds(args.cards));
    const known = new Set(catalog.map((card) => card.id));
    const unknown = deckCardIds(args.cards).filter((id) => !known.has(id));
    if (unknown.length > 0) {
        return errorResult(`Carte(s) inconnue(s) dans ce jeu : ${unknown.join(", ")}.`);
    }

    const update = await updateDeck(
        found.deck.id,
        userId,
        deckContent(args.cards, zones, new Map(catalog.map((card) => [card.id, card.name]))),
        args.expectedVersion,
    );
    if (!update.ok && update.error === "not-found") {
        return errorResult("Deck introuvable parmi vos decks.");
    }

    const deck = await loadEditorDeck(update.deck, userId, game);
    if (update.ok) revalidateDeck(deck.id);
    const result: DeckEditorSaveResult = update.ok
        ? { ok: true, deck }
        : { ok: false, conflict: true, deck };
    return {
        content: [{
            type: "text",
            text: update.ok
                ? `Deck enregistré (version ${deck.version}).`
                : `Le deck a été enregistré ailleurs entre-temps (version ${deck.version}) : rien n'a été écrit.`,
        }],
        structuredContent: result,
    };
}

// --- Enregistrement ---

/** La vue MCP App de l'éditeur de deck (mcp-apps/deck-editor). */
function registerDeckEditorView(server: McpServer) {
    const ui = { csp: { resourceDomains: CARD_IMAGE_DOMAINS }, prefersBorder: true };
    registerAppResource(server, "Éditeur de deck", DECK_EDITOR_VIEW_URI, {
        description: "Éditeur de deck Joutes : contenu par zone, légalité, recherche de cartes, enregistrement sur Joutes.",
        _meta: { ui },
    }, async () => ({
        contents: [{
            uri: DECK_EDITOR_VIEW_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: DECK_EDITOR_VIEW_HTML,
            _meta: { ui },
        }],
    }));
}

export function registerDeckTools(server: McpServer) {
    registerDeckEditorView(server);

    registerJoutesTool(server, "list_my_decks", {
        title: "List my decks",
        description: "Lister les decks de l'utilisateur sur Joutes, le plus récemment modifié d'abord, avec leur taille et leur légalité.",
        inputSchema: {
            gameName: z.string().optional().describe("Nom ou slug du jeu (ex. riftbound)"),
            search: z.string().max(100).optional().describe("Partie du nom du deck"),
        },
    }, withToolLogging("list_my_decks", handleListMyDecks));

    registerJoutesTool(server, "get_deck", {
        title: "Get deck",
        description: "Lire un deck de l'utilisateur : cartes par zone, exemplaires possédés, légalité de chaque zone.",
        inputSchema: {
            deckId: z.string().optional().describe("Identifiant du deck (voir list_my_decks)"),
            deckName: z.string().optional().describe("Nom du deck, si l'identifiant n'est pas connu"),
        },
    }, withToolLogging("get_deck", handleGetDeck));

    registerJoutesTool(server, "create_deck", {
        title: "Create deck",
        description:
            "Créer un deck pour l'utilisateur, vide ou depuis une liste texte (« 3 Nom de carte » par ligne, sections « Légende : », « Runes : »… facultatives ; " +
            "sans section, chaque carte va dans sa zone selon son type).",
        inputSchema: {
            gameName: z.string().describe("Nom ou slug du jeu (ex. riftbound)"),
            name: z.string().min(1).max(100).describe("Nom du deck, unique parmi ceux de l'utilisateur"),
            deckList: z.string().max(20000).optional().describe("Liste de cartes en texte"),
            visibility: deckVisibilitySchema.optional().describe("private (défaut), unlisted ou public"),
        },
    }, withToolLogging("create_deck", handleCreateDeck));

    registerJoutesTool(server, "update_deck_cards", {
        title: "Update deck cards",
        description:
            "Ajouter ou retirer des cartes d'un deck de l'utilisateur, par nom. Sans zone, un ajout va là où le type de la carte la range " +
            "(légende, champion choisi, runes, champs de bataille, sinon deck principal). Renvoie la légalité à jour.",
        inputSchema: {
            deckId: z.string().describe("Identifiant du deck"),
            changes: z.array(changeSchema).min(1).max(60),
            expectedVersion: z.number().int().min(1).optional().describe("Version lue ; refuse d'écrire si le deck a changé depuis"),
        },
    }, withToolLogging("update_deck_cards", handleUpdateDeckCards));

    registerJoutesTool(server, "open_deck_editor", {
        title: "Mes decks Joutes",
        view: DECK_EDITOR_VIEW_URI,
        entrypoint: true,
        description:
            "Ouvrir l'éditeur de deck interactif de Joutes : un deck précis (deckId ou deckName), ou la liste des decks de l'utilisateur. " +
            "L'utilisateur y ajoute et retire des cartes lui-même ; quand l'éditeur est ouvert, il donne aussi à l'assistant des outils pour modifier le deck affiché.",
        inputSchema: {
            deckId: z.string().optional().describe("Identifiant du deck à ouvrir"),
            deckName: z.string().optional().describe("Nom du deck à ouvrir"),
            gameName: z.string().optional().describe("Sans deck désigné : ne lister que les decks de ce jeu"),
        },
    }, withToolLogging("open_deck_editor", handleOpenDeckEditor));

    registerJoutesTool(server, "deck_editor_search_cards", {
        title: "Search cards for the deck editor",
        visibility: ["app"],
        description: "Réservé à la vue de l'éditeur de deck : chercher des cartes du jeu d'un deck, avec les exemplaires possédés.",
        inputSchema: {
            deckId: z.string(),
            query: z.string().max(100),
            domain: z.string().max(40).optional(),
        },
    }, withToolLogging("deck_editor_search_cards", handleSearchCards));

    registerJoutesTool(server, "deck_editor_save", {
        title: "Save deck from the deck editor",
        visibility: ["app"],
        description: "Réservé à la vue de l'éditeur de deck : enregistrer le contenu du deck tel que l'utilisateur l'a édité.",
        inputSchema: {
            deckId: z.string(),
            cards: deckCardsSchema,
            expectedVersion: z.number().int().min(1).optional(),
        },
    }, withToolLogging("deck_editor_save", handleSave));
}
