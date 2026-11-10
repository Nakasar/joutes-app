import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import { postComment, readCommentThread } from "@/lib/decks/comment-service";
import { deckCardIds } from "@/lib/decks/contents";
import { getDeckById } from "@/lib/db/decks";
import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { readAllGames } from "@/lib/db/games-cached";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { getUsersByIds } from "@/lib/db/users";
import { linkLine, mcpLinks } from "@/lib/mcp/links";
import { normalizeName, pickByName } from "@/lib/mcp/meta";
import {
    commentErrorText,
    describeCommentThread,
    describeGroupDecks,
    describeGroupMeta,
    describeGroupTournaments,
    describeMyResults,
    describeResult,
    resultErrorText,
} from "@/lib/mcp/play-group-game";
import { readGroupDeckLibrary } from "@/lib/play-groups/deck-library";
import { filterGroupDecks } from "@/lib/play-groups/decks";
import { readGroupMeta } from "@/lib/play-groups/meta-data";
import { groupPalmares } from "@/lib/play-groups/tournaments";
import { declareResult, listMyResults, readGroupTournaments } from "@/lib/tournaments/result-service";
import { parseRecord } from "@/lib/tournaments/results";
import type { Game } from "@/lib/types/Game";
import type { PlayGroup } from "@/lib/types/PlayGroup";
import { registerJoutesTool, userIdFrom, type ToolResult } from "./tool-policy";
import { errorResult, textResult, withToolLogging } from "./tools";

/*
 * Le jeu en groupe : la bibliothèque de decks partagés, les commentaires d'un
 * deck, les résultats de tournoi et la méta du groupe. Mêmes services et mêmes
 * règles que les vues du groupe et l'API mobile : un groupe se lit par ses
 * membres, un fil de commentaires par qui y a accès, un résultat se déclare
 * pour soi.
 */

type Member = { userId: string; name: string };

/** Le groupe, si l'utilisateur en est membre, et le nom de chacun. */
async function openGroup(
    playGroupId: string,
    userId: string,
): Promise<{ group: PlayGroup; members: Member[]; nameOf: (id: string) => string } | { error: ToolResult }> {
    const group = await getPlayGroupByIdAndUser(playGroupId, userId);
    if (!group) return { error: errorResult("Groupe de jeu introuvable ou vous n'en êtes pas membre (list_play_groups donne les identifiants).") };

    const users = await getUsersByIds(group.members.map((member) => member.userId));
    const names = new Map(users.map((user) => [user.id, user.displayName || user.username || "Joueur"]));
    const members = group.members.map((member) => ({ userId: member.userId, name: names.get(member.userId) ?? "Joueur" }));
    const nameOf = (id: string) => (id === userId ? `${names.get(id) ?? "Vous"} (vous)` : (names.get(id) ?? "ancien membre"));

    return { group, members, nameOf };
}

/** Un membre par son nom, « moi » compris. */
function pickMember(members: Member[], query: string, userId: string): { userId: string } | { error: ToolResult } {
    if (["moi", "me", "myself", "vous"].includes(normalizeName(query))) return { userId };
    const match = pickByName(members, (member) => member.name, query);
    if ("found" in match) return { userId: match.found.userId };
    if ("ambiguous" in match) {
        return { error: errorResult(`Plusieurs membres répondent à « ${query} » : ${match.ambiguous.map((m) => m.name).join(", ")}.`) };
    }
    return { error: errorResult(`Aucun membre « ${query} ». Membres : ${members.map((m) => m.name).join(", ")}.`) };
}

/** Un jeu par son nom, son slug ou son identifiant. */
function pickGame(games: Game[], query: string): { game: Game } | { error: ToolResult } {
    const exact = games.find((game) => game.id === query || game.slug === query);
    if (exact) return { game: exact };
    const match = pickByName(games, (game) => game.name, query);
    if ("found" in match) return { game: match.found };
    return { error: errorResult(`Jeu « ${query} » introuvable.`) };
}

// ---------------------------------------------------------------------------
// Bibliothèque de decks
// ---------------------------------------------------------------------------

async function handleListGroupDecks(
    args: { playGroupId: string; gameName?: string; memberName?: string; query?: string },
    extra: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    const opened = await openGroup(args.playGroupId, userId);
    if ("error" in opened) return opened.error;

    const games = await readAllGames();
    const filters: { gameId?: string; ownerId?: string; query?: string } = {};
    if (args.gameName) {
        const picked = pickGame(games, args.gameName);
        if ("error" in picked) return picked.error;
        filters.gameId = picked.game.id;
    }
    if (args.memberName) {
        const picked = pickMember(opened.members, args.memberName, userId);
        if ("error" in picked) return picked.error;
        filters.ownerId = picked.userId;
    }
    if (args.query?.trim()) filters.query = args.query.trim().slice(0, 80);

    const library = await readGroupDeckLibrary(opened.group.id);
    const entries = filterGroupDecks(library, filters);
    const gameName = new Map(games.map((game) => [game.id, game.name]));
    const lines = entries.map(({ link, deck }) => ({
        deckId: deck.id,
        name: deck.name,
        legendName: deck.legendName,
        format: deck.format,
        visibility: deck.visibility,
        version: deck.version,
        ownerName: opened.nameOf(link.ownerId),
        gameName: gameName.get(deck.gameId),
        pinnedAt: link.pinnedAt,
        pinNote: link.pinNote,
    }));

    return textResult(
        describeGroupDecks(opened.group.name, lines, library.length) +
            linkLine(`${mcpLinks.playGroup(opened.group.id)}?view=decks`),
    );
}

// ---------------------------------------------------------------------------
// Commentaires de deck
// ---------------------------------------------------------------------------

/** L'espace d'un fil : celui du groupe nommé, sinon les notes personnelles de l'auteur du deck. */
async function spaceFor(
    playGroupId: string | undefined,
    userId: string,
): Promise<{ space: string; label: string; groupId?: string } | { error: ToolResult }> {
    if (!playGroupId) return { space: "personal", label: "notes personnelles" };
    const group = await getPlayGroupByIdAndUser(playGroupId, userId);
    if (!group) return { error: errorResult("Groupe de jeu introuvable ou vous n'en êtes pas membre.") };
    return { space: `group:${group.id}`, label: `fil du groupe « ${group.name} »`, groupId: group.id };
}

function deckCommentsLink(deckId: string, groupId?: string): string {
    return groupId
        ? `${mcpLinks.playGroup(groupId)}?view=decks&deck=${encodeURIComponent(deckId)}`
        : `${mcpLinks.deck(deckId)}?tab=comments`;
}

async function handleGetDeckComments(
    args: { deckId: string; playGroupId?: string },
    extra: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    const space = await spaceFor(args.playGroupId, userId);
    if ("error" in space) return space.error;

    const read = await readCommentThread(args.deckId, space.space, userId);
    if (!read.ok) return errorResult(commentErrorText(read.error));
    const deck = await getDeckById(args.deckId);

    return textResult(
        describeCommentThread(read.thread, deck?.name ?? "Deck", space.label) + linkLine(deckCommentsLink(args.deckId, space.groupId)),
    );
}

/**
 * Les cartes à lier, données par nom ou par identifiant, cherchées parmi
 * celles du deck seulement : « Jinx » désigne la Jinx du deck.
 */
async function resolveDeckCards(deckId: string, wanted: string[]): Promise<{ cardIds: string[] } | { error: ToolResult }> {
    if (wanted.length === 0) return { cardIds: [] };
    const deck = await getDeckById(deckId);
    if (!deck) return { error: errorResult(commentErrorText("NOT_FOUND")) };

    const ids = deckCardIds(deck.cards);
    const infos = await getDeckCardInfos(deck.gameId, ids);
    const cards = ids.map((id) => ({ id, name: infos.find((info) => info.id === id)?.name ?? id }));
    const cardIds: string[] = [];
    for (const query of wanted) {
        const byId = cards.find((card) => card.id === query);
        const match = byId ? { found: byId } : pickByName(cards, (card) => card.name, query);
        if ("found" in match) {
            if (!cardIds.includes(match.found.id)) cardIds.push(match.found.id);
        } else if ("ambiguous" in match) {
            return { error: errorResult(`« ${query} » désigne plusieurs cartes du deck : ${match.ambiguous.map((c) => c.name).join(", ")}.`) };
        } else {
            return { error: errorResult(`Aucune carte « ${query} » dans ce deck.`) };
        }
    }
    return { cardIds };
}

async function handleAddDeckComment(
    args: { deckId: string; playGroupId?: string; body: string; cards?: string[]; parentId?: string },
    extra: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    const space = await spaceFor(args.playGroupId, userId);
    if ("error" in space) return space.error;

    // Lire d'abord : l'accès au fil se vérifie avant de révéler quoi que ce soit des cartes du deck.
    const read = await readCommentThread(args.deckId, space.space, userId);
    if (!read.ok) return errorResult(commentErrorText(read.error));

    const resolved = await resolveDeckCards(args.deckId, args.cards ?? []);
    if ("error" in resolved) return resolved.error;

    const posted = await postComment(args.deckId, space.space, userId, {
        body: args.body,
        cardIds: resolved.cardIds,
        ...(args.parentId ? { parentId: args.parentId } : {}),
    });
    if (!posted.ok) return errorResult(commentErrorText(posted.error));

    const cards = Object.values(posted.comment.cardNames ?? {});
    return textResult(
        `${args.parentId ? "Réponse publiée" : "Commentaire publié"} dans le ${space.label} (id : ${posted.comment.id})` +
            (cards.length ? `, lié à ${cards.join(", ")}` : "") +
            "." +
            linkLine(deckCommentsLink(args.deckId, space.groupId)),
    );
}

// ---------------------------------------------------------------------------
// Résultats de tournoi
// ---------------------------------------------------------------------------

async function handleListMyResults(args: { gameName?: string }, extra: ServerContext): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    const listed = await listMyResults(userId);
    if (!listed.ok) return errorResult(resultErrorText(listed.error));

    const games = await readAllGames();
    let results = listed.results;
    if (args.gameName) {
        const picked = pickGame(games, args.gameName);
        if ("error" in picked) return picked.error;
        results = results.filter((result) => result.gameId === picked.game.id);
    }
    const gameName = new Map(games.map((game) => [game.id, game.name]));

    return textResult(describeMyResults(results, (gameId) => (gameId ? gameName.get(gameId) : undefined)));
}

async function handleDeclareResult(
    args: {
        name?: string;
        date?: string;
        gameName?: string;
        joutesTournamentId?: string;
        place?: string;
        playerCount?: number;
        placement?: number;
        topCut?: number;
        record?: string;
        deckId?: string;
        legendName?: string;
        visibility?: "groups" | "public";
    },
    extra: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    const games = await readAllGames();

    let gameId: string | undefined;
    if (args.gameName) {
        const picked = pickGame(games, args.gameName);
        if ("error" in picked) return picked.error;
        gameId = picked.game.id;
    } else if (!args.joutesTournamentId) {
        return errorResult("Précisez le jeu (gameName), ou joutesTournamentId pour un tournoi Joutes.");
    }

    let record: { wins: number; losses: number; draws: number } | undefined;
    if (args.record) {
        record = parseRecord(args.record.trim());
        if (!record) return errorResult(resultErrorText("RECORD"));
    }

    const declared = await declareResult(userId, {
        name: args.name,
        date: args.date,
        gameId,
        joutesTournamentId: args.joutesTournamentId,
        place: args.place,
        playerCount: args.playerCount,
        placement: args.placement,
        topCut: args.topCut,
        record,
        deckId: args.deckId,
        legendName: args.legendName,
        visibility: args.visibility ?? "groups",
    });
    if (!declared.ok) return errorResult(resultErrorText(declared.error));

    const gameName = games.find((game) => game.id === declared.result.gameId)?.name;
    return textResult(`Résultat enregistré (id : ${declared.result.id}) :\n${describeResult(declared.result, gameName)}`);
}

// ---------------------------------------------------------------------------
// Tournois et méta du groupe
// ---------------------------------------------------------------------------

async function handleGroupTournaments(
    args: { playGroupId: string; gameName?: string; memberName?: string; before?: string },
    extra: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    const opened = await openGroup(args.playGroupId, userId);
    if ("error" in opened) return opened.error;

    const filters: { gameId?: string; userId?: string; before?: string } = {};
    if (args.gameName) {
        const picked = pickGame(await readAllGames(), args.gameName);
        if ("error" in picked) return picked.error;
        filters.gameId = picked.game.id;
    }
    if (args.memberName) {
        const picked = pickMember(opened.members, args.memberName, userId);
        if ("error" in picked) return picked.error;
        filters.userId = picked.userId;
    }
    if (args.before) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.before)) return errorResult("before s'écrit AAAA-MM, par exemple 2026-09.");
        filters.before = args.before;
    }

    const memberIds = opened.group.members.map((member) => member.userId);
    const { summaries, timeline } = await readGroupTournaments(memberIds, filters);
    const inGame = filters.gameId ? summaries.filter((result) => result.gameId === filters.gameId) : summaries;

    return textResult(
        describeGroupTournaments(opened.group.name, timeline, groupPalmares(inGame), opened.nameOf) +
            linkLine(`${mcpLinks.playGroup(opened.group.id)}?view=tournaments`),
    );
}

async function handleGroupMeta(
    args: { playGroupId: string; gameName?: string; setCode?: string; memberName?: string; compare?: boolean },
    extra: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    const opened = await openGroup(args.playGroupId, userId);
    if ("error" in opened) return opened.error;

    let gameId: string | undefined;
    if (args.gameName) {
        const picked = pickGame(await readAllGames(), args.gameName);
        if ("error" in picked) return picked.error;
        gameId = picked.game.id;
    }
    let memberId: string | undefined;
    if (args.memberName) {
        const picked = pickMember(opened.members, args.memberName, userId);
        if ("error" in picked) return picked.error;
        memberId = picked.userId;
    }
    const ext = args.setCode?.trim();
    if (ext && !/^[A-Za-z0-9_-]{1,24}$/.test(ext)) return errorResult("setCode : un code d'extension (ex. UNL) ou « tout ».");

    const memberIds = opened.group.members.map((member) => member.userId);
    const page = await readGroupMeta(opened.group.id, memberIds, {
        tab: "overview",
        compare: args.compare ?? true,
        ...(gameId ? { gameId } : {}),
        ...(ext ? { ext } : {}),
        ...(memberId ? { userId: memberId } : {}),
    });
    if (gameId && page.game?.id !== gameId) {
        return errorResult(`Aucun résultat des membres sur ce jeu. Jeux joués : ${page.games.map((entry) => entry.game.name).join(", ") || "aucun"}.`);
    }

    return textResult(
        describeGroupMeta(opened.group.name, page, opened.nameOf) + linkLine(`${mcpLinks.playGroup(opened.group.id)}?view=meta`),
    );
}

export function registerPlayGroupGameTools(server: McpServer) {
    registerJoutesTool(server, "list_play_group_decks", {
        title: "List play group decks",
        description:
            "La bibliothèque de decks d'un groupe de jeu : les decks que ses membres y ont partagés (privés compris, lisibles des membres), " +
            "épinglés d'abord. Filtres facultatifs : jeu, membre (nom ou « moi »), recherche dans le nom du deck ou de sa légende.",
        inputSchema: {
            playGroupId: z.string().describe("Identifiant du groupe (list_play_groups)"),
            gameName: z.string().optional(),
            memberName: z.string().optional().describe("Nom d'un membre, ou « moi »"),
            query: z.string().optional(),
        },
    }, withToolLogging("list_play_group_decks", handleListGroupDecks));
    registerJoutesTool(server, "get_deck_comments", {
        title: "Get deck comments",
        description:
            "Le fil de commentaires d'un deck : celui d'un groupe où le deck est partagé (avec playGroupId, membres du groupe), " +
            "ou, sans playGroupId, les notes personnelles de l'auteur du deck. Commentaires ouverts puis résolus, avec réponses et cartes liées.",
        inputSchema: {
            deckId: z.string(),
            playGroupId: z.string().optional().describe("Le groupe dont on lit le fil ; absent : notes personnelles"),
        },
    }, withToolLogging("get_deck_comments", handleGetDeckComments));
    registerJoutesTool(server, "add_deck_comment", {
        title: "Add deck comment",
        description:
            "Écrire un commentaire sur un deck, ou répondre à un commentaire (parentId). Dans le fil d'un groupe (playGroupId) ou dans " +
            "les notes personnelles de l'auteur du deck. Texte brut, 2 000 caractères au plus ; jusqu'à 10 cartes du deck liées, " +
            "par nom ou identifiant (pas sur une réponse). L'auteur du deck est notifié d'un commentaire de groupe.",
        inputSchema: {
            deckId: z.string(),
            playGroupId: z.string().optional(),
            body: z.string().min(1).max(2000),
            cards: z.array(z.string()).max(10).optional().describe("Cartes du deck à lier, par nom ou identifiant"),
            parentId: z.string().optional().describe("Le commentaire auquel on répond"),
        },
    }, withToolLogging("add_deck_comment", handleAddDeckComment));
    registerJoutesTool(server, "list_my_tournament_results", {
        title: "List my tournament results",
        description:
            "Mes résultats de tournoi, toutes sources : tournois Joutes, joueurs du locator reconnus, résultats déclarés. " +
            "Classement, bilan, légende, deck lié et visibilité.",
        inputSchema: {
            gameName: z.string().optional(),
        },
    }, withToolLogging("list_my_tournament_results", handleListMyResults));
    registerJoutesTool(server, "declare_tournament_result", {
        title: "Declare tournament result",
        description:
            "Déclarer un de mes résultats de tournoi. Pour un tournoi Joutes terminé où j'étais inscrit, joutesTournamentId suffit " +
            "(nom, date, jeu et lieu viennent du tournoi). Sinon : name, date (ISO) et gameName. Classement, nombre de joueurs, " +
            "phase finale (4 à 64), bilan « 5-1-0 », deck (un des miens, du même jeu : légende et domaines en viennent) ou légende seule. " +
            "Visible des membres de mes groupes par défaut, ou public.",
        inputSchema: {
            joutesTournamentId: z.string().optional(),
            name: z.string().optional(),
            date: z.string().optional().describe("Date du tournoi, ISO 8601 (2026-11-08)"),
            gameName: z.string().optional(),
            place: z.string().optional(),
            playerCount: z.number().int().optional(),
            placement: z.number().int().optional(),
            topCut: z.number().int().optional(),
            record: z.string().optional().describe("Victoires-défaites-nuls, ex. 5-1-0"),
            deckId: z.string().optional(),
            legendName: z.string().optional(),
            visibility: z.enum(["groups", "public"]).optional(),
        },
    }, withToolLogging("declare_tournament_result", handleDeclareResult));
    registerJoutesTool(server, "get_play_group_tournaments", {
        title: "Get play group tournaments",
        description:
            "Les tournois des membres d'un groupe de jeu : palmarès, puis timeline par tournoi (place, bilan, légende de chaque membre), " +
            "les plus récents d'abord, environ douze tournois par page. Filtres : jeu, membre ; before = AAAA-MM pour les mois précédents.",
        inputSchema: {
            playGroupId: z.string(),
            gameName: z.string().optional(),
            memberName: z.string().optional(),
            before: z.string().optional(),
        },
    }, withToolLogging("get_play_group_tournaments", handleGroupTournaments));
    registerJoutesTool(server, "get_play_group_meta", {
        title: "Get play group meta",
        description:
            "La méta d'un groupe de jeu, calculée sur les résultats de tournoi de ses membres : légendes jouées (part, écart à la méta " +
            "du jeu, winrate), domaines, bilan contre les légendes adverses, membres. Par défaut le jeu le plus joué et l'extension en " +
            "cours ; setCode = une extension ou « tout ».",
        inputSchema: {
            playGroupId: z.string(),
            gameName: z.string().optional(),
            setCode: z.string().optional(),
            memberName: z.string().optional(),
            compare: z.boolean().optional().describe("Comparer à la méta du jeu (oui par défaut)"),
        },
    }, withToolLogging("get_play_group_meta", handleGroupMeta));
}
