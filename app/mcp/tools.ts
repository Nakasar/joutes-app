import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import db from "@/lib/mongodb";
import {
    CollectionOwner,
    getCollectionOverview,
    getGameCollection,
} from "@/lib/db/collection";
import {
    addWishlistItem,
    createWishlist,
    getWishlistAccess,
    getWishlistById,
    getWishlistCardnexusOrder,
    getWishlistItems,
    getWishlistsForOwner,
    removeWishlistItem,
} from "@/lib/db/wishlists";
import {
    createPlayGroup,
    createPlayGroupInvitation,
    getPlayGroupByIdAndUser,
    getPlayGroupsForUser,
} from "@/lib/db/play-groups";
import {
    addPlayerByIdentifier,
    advanceToNextPhase,
    assertCanManage,
    assertCanReadTournament,
    canManageTournament,
    buildMatchActor,
    createAnnouncement,
    createNextRound,
    createTournament,
    forfeitMatch,
    getMatchById,
    getPhaseById,
    getStandings,
    getTournamentByJoinCode,
    getTournamentById,
    listMatchesByRound,
    listPhases,
    listPlayerTournamentsForUser,
    listPlayers,
    listPuzzleSeats,
    listRounds,
    listTournamentsForUser,
    pauseTimer,
    recordActivity,
    reportMatchResult,
    resumeTimer,
    sanitizePlayer,
    startTimer,
    stopTimer,
    TournamentError,
    updatePlayer,
    updateTournament,
} from "@/lib/db/tournaments";
import {
    notifyAnnouncement,
    notifyRoundCompleteIfDone,
    notifyRoundPaired,
} from "@/lib/tournaments/notifications";
import { getUserByEmail, getUserByTagOrId, getUsersByIds } from "@/lib/db/users";
import { formatDuration } from "@/lib/tournament-timer";
import { removeSellListItemByCollectionEntryId } from "@/lib/db/sell-lists";
import { collectionLanguage } from "@/lib/schemas/collection.schema";
import { parseDeckList, serializeDeckList, stringifyDeckList } from "@/app/[locale]/(app)/games/riftbound/deck-checker/utils";
import {
    DeckList,
    DeckListCard,
    getDeckFromPiltover,
    getDeckFromPiltoverCode,
    validateDeckList,
} from "@/app/[locale]/(app)/games/riftbound/deck-checker/action";
import type { Game } from "@/lib/types/Game";
import type { Wishlist } from "@/lib/types/Wishlist";
import { revalidatePath } from "next/cache";
import { createErrata, ErrataInputError, updateErrataById } from "@/lib/db/erratas";
import { anyUserHasPermission } from "@/lib/db/permissions";
import { createErrataSchema } from "@/lib/schemas/errata.schema";
import { locales } from "@/i18n/config";
import { linkLine, mcpLinks } from "@/lib/mcp/links";
import {
    describeRound,
    describeRoundMatches,
    describeTournamentStatus,
    findTournamentPlayer,
    playerLabel,
    plannedRoundsLabel,
} from "@/lib/mcp/tournament-status";
import { resolveCurrentRound, resolveDisplayPhase } from "@/lib/tournaments/current-round";
import type { Tournament, TournamentGameResult, TournamentMatch } from "@/lib/types/Tournament";
import type { ErrataDb, ErrataType } from "@/lib/types/errata";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { DeckViewCard, DeckViewList } from "@/components/decks/DeckCheckView";
import { DECK_CHECK_VIEW_URI, type DeckCheckResult } from "@/mcp-apps/deck-check/result";
import { DECK_CHECK_VIEW_HTML } from "./apps/deck-check.generated";
import { AUTH_REQUIRED, registerJoutesTool, ToolResult, userIdFrom } from "./tool-policy";

type ToolExtra = ServerContext;

// Enveloppe chaque outil MCP pour logger son invocation et catcher les erreurs
// non gérées par le handler lui-même. Les TournamentError et ErrataInputError
// portent un message utilisateur : il est renvoyé tel quel plutôt qu'un
// message générique.
export function withToolLogging<Args extends unknown[]>(
    name: string,
    handler: (...args: Args) => Promise<ToolResult>
): (...args: Args) => Promise<ToolResult> {
    return async (...args: Args) => {
        console.log(`[MCP] Appel de l'outil "${name}"`);
        try {
            return await handler(...args);
        } catch (error) {
            console.error(`[MCP] Erreur lors de l'exécution de l'outil "${name}":`, error);
            const message = error instanceof TournamentError || error instanceof ErrataInputError
                ? error.message
                : `Erreur lors de l'exécution de l'outil "${name}".`;
            return errorResult(message);
        }
    };
}

function textResult(text: string): ToolResult {
    return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
    return { content: [{ type: "text", text }], isError: true };
}

/** Résout un jeu par nom ou slug (insensible à la casse pour le nom). */
async function resolveGame(gameName: string): Promise<(Game & { _id: ObjectId }) | null> {
    return db.collection<Game & { _id: ObjectId }>("games").findOne({
        $or: [
            { slug: gameName.toLowerCase() },
            { name: { $regex: `^${escapeRegex(gameName)}$`, $options: "i" } },
        ],
    });
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Propriétaire d'une collection/wishlist : l'utilisateur lui-même, ou un
 * groupe de jeu dont il est membre (sinon erreur).
 */
async function resolveOwner(
    userId: string,
    playGroupId?: string
): Promise<{ owner: CollectionOwner } | { error: ToolResult }> {
    if (!playGroupId) {
        return { owner: { type: "user", id: userId } };
    }
    const group = await getPlayGroupByIdAndUser(playGroupId, userId);
    if (!group) {
        return { error: errorResult("Groupe de jeu introuvable ou vous n'en êtes pas membre.") };
    }
    return { owner: { type: "playGroup", id: group.id } };
}

type CatalogCard = {
    id: string;
    name: string;
    setCode: string;
    collectorNumber: string | number;
    image?: string;
};

/**
 * Résout une carte du catalogue par jeu + nom (+ setCode/collectorNumber
 * optionnels). Si plusieurs impressions distinctes correspondent, renvoie une
 * erreur listant les impressions pour que l'appelant précise sa demande.
 */
async function resolveCard(
    gameId: ObjectId,
    cardName: string,
    setCode?: string,
    collectorNumber?: string
): Promise<{ card: CatalogCard } | { error: ToolResult }> {
    const match: Record<string, unknown> = {
        gameId,
        name: { $regex: `^${escapeRegex(cardName)}$`, $options: "i" },
    };
    if (setCode) match.setCode = setCode.toUpperCase();
    if (collectorNumber) {
        // collectorNumber est stocké tantôt en string tantôt en nombre selon les jeux.
        const asNumber = Number(collectorNumber);
        match.collectorNumber = Number.isNaN(asNumber)
            ? collectorNumber
            : { $in: [collectorNumber, asNumber] };
    }

    const candidates = await db
        .collection<CatalogCard & { _id: ObjectId }>("cards")
        .find(match, { projection: { id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1 } })
        .sort({ setCode: 1, collectorNumber: 1 })
        .limit(25)
        .toArray();

    if (candidates.length === 0) {
        return { error: errorResult(`Aucune carte "${cardName}" trouvée${setCode ? ` dans le set ${setCode}` : ""}.`) };
    }

    // Dédoublonne les langues : une impression = (setCode, collectorNumber).
    const byPrinting = new Map<string, CatalogCard>();
    for (const candidate of candidates) {
        const key = `${candidate.setCode}|${candidate.collectorNumber}`;
        if (!byPrinting.has(key)) byPrinting.set(key, candidate);
    }
    const printings = [...byPrinting.values()];

    if (printings.length > 1) {
        return {
            error: errorResult(
                `Plusieurs impressions trouvées pour "${cardName}". Précisez setCode et collectorNumber parmi :\n` +
                printings.map(p => `- ${p.setCode} #${p.collectorNumber}`).join("\n")
            ),
        };
    }

    return { card: printings[0] };
}

function formatPercent(owned: number, total: number): string {
    if (total === 0) return "n/a";
    return `${Math.round((owned / total) * 100)}% (${owned}/${total})`;
}

// --- Collections ---

async function handleGetCollection(
    args: { playGroupId?: string; gameName?: string; setCode?: string; search?: string; ownedOnly?: boolean; page?: number },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const resolved = await resolveOwner(userId, args.playGroupId);
    if ("error" in resolved) return resolved.error;

    if (!args.gameName) {
        const overview = await getCollectionOverview(resolved.owner);
        const gamesText = overview.games.map(g =>
            `**${g.name}** — ${g.copies} exemplaire(s), master set : ${formatPercent(g.masterOwned, g.masterTotal)}, game set : ${formatPercent(g.gameOwned, g.gameTotal)}`
        ).join("\n");
        return textResult(
            `Collection ${resolved.owner.type === "playGroup" ? "du groupe" : "personnelle"} : ${overview.totalCopies} exemplaire(s) sur ${overview.gamesWithItems} jeu(x).\n\n${gamesText || "Collection vide."}`
        );
    }

    const game = await resolveGame(args.gameName);
    if (!game) return errorResult(`Jeu "${args.gameName}" non trouvé.`);

    const page = Math.max(1, args.page ?? 1);
    const result = await getGameCollection({
        owner: resolved.owner,
        gameId: game._id.toString(),
        setCode: args.setCode,
        search: args.search,
        owned: args.ownedOnly ? true : undefined,
        page,
        limit: 30,
    });

    const itemsText = result.items.map(item =>
        `- ${item.name} (${item.setCode} #${item.collectorNumber})${item.quantity > 0 ? ` ×${item.quantity}` : " — non possédée"}`
    ).join("\n");
    const statsText = result.stats
        ? `Master set : ${formatPercent(result.stats.masterOwned, result.stats.masterTotal)}, game set : ${formatPercent(result.stats.gameOwned, result.stats.gameTotal)}.`
        : "";

    return textResult(
        `Collection ${game.name} — page ${result.page}/${result.totalPages} (${result.total} carte(s)). ${statsText}\n\n${itemsText || "Aucune carte."}`
    );
}

async function handleAddCardToCollection(
    args: { gameName: string; cardName: string; setCode?: string; collectorNumber?: string; quantity?: number; foil?: boolean; language?: string; playGroupId?: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const resolved = await resolveOwner(userId, args.playGroupId);
    if ("error" in resolved) return resolved.error;

    const game = await resolveGame(args.gameName);
    if (!game) return errorResult(`Jeu "${args.gameName}" non trouvé.`);

    const cardResult = await resolveCard(game._id, args.cardName, args.setCode, args.collectorNumber);
    if ("error" in cardResult) return cardResult.error;
    const card = cardResult.card;

    const quantity = Math.min(Math.max(args.quantity ?? 1, 1), 100);
    const ownerField = resolved.owner.type === "user" ? "userId" : "playGroupId";
    const documents = Array.from({ length: quantity }, () => ({
        cardId: card.id,
        setCode: card.setCode,
        collectorNumber: String(card.collectorNumber ?? ""),
        name: card.name,
        image: card.image ?? "",
        [ownerField]: new ObjectId(resolved.owner.id),
        ...(args.foil !== undefined && { foil: args.foil }),
        ...(args.language !== undefined && { language: args.language }),
    }));
    await db.collection("collection-cards").insertMany(documents);

    return textResult(
        `${quantity} exemplaire(s) de **${card.name}** (${card.setCode} #${card.collectorNumber}) ajouté(s) à la collection${resolved.owner.type === "playGroup" ? " du groupe" : ""}.` +
        linkLine(mcpLinks.collection(game.slug ?? game._id.toString(), args.playGroupId))
    );
}

async function handleRemoveCardFromCollection(
    args: { gameName: string; cardName: string; setCode?: string; collectorNumber?: string; quantity?: number; playGroupId?: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const resolved = await resolveOwner(userId, args.playGroupId);
    if ("error" in resolved) return resolved.error;

    const game = await resolveGame(args.gameName);
    if (!game) return errorResult(`Jeu "${args.gameName}" non trouvé.`);

    const cardResult = await resolveCard(game._id, args.cardName, args.setCode, args.collectorNumber);
    if ("error" in cardResult) return cardResult.error;
    const card = cardResult.card;

    const ownerField = resolved.owner.type === "user" ? "userId" : "playGroupId";
    const filter = {
        [ownerField]: new ObjectId(resolved.owner.id),
        cardId: card.id,
        setCode: card.setCode,
        collectorNumber: String(card.collectorNumber ?? ""),
    };

    const quantity = Math.min(Math.max(args.quantity ?? 1, 1), 100);
    let removed = 0;
    for (let i = 0; i < quantity; i++) {
        const deleted = await db.collection("collection-cards").findOneAndDelete(filter);
        if (!deleted) break;
        await removeSellListItemByCollectionEntryId(deleted._id.toString());
        removed++;
    }

    if (removed === 0) {
        return errorResult(`Aucun exemplaire de "${card.name}" (${card.setCode} #${card.collectorNumber}) dans la collection.`);
    }
    return textResult(
        `${removed} exemplaire(s) de **${card.name}** (${card.setCode} #${card.collectorNumber}) retiré(s) de la collection.` +
        linkLine(mcpLinks.collection(game.slug ?? game._id.toString(), args.playGroupId))
    );
}

// --- Wishlists ---

async function handleListWishlists(_args: Record<string, never>, extra: ToolExtra): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const [personal, playGroups] = await Promise.all([
        getWishlistsForOwner({ type: "user", id: userId }),
        getPlayGroupsForUser(userId),
    ]);
    const groupWishlists = await Promise.all(
        playGroups.map(async group => ({
            group,
            wishlists: await getWishlistsForOwner({ type: "playGroup", id: group.id }),
        }))
    );

    const lines = [
        ...personal.map(w => `- **${w.name}** (ID: ${w.id}) — ${w.itemsCount} carte(s), visibilité ${w.visibility}`),
        ...groupWishlists.flatMap(({ group, wishlists }) =>
            wishlists.map(w => `- **${w.name}** (ID: ${w.id}) — groupe « ${group.name} », ${w.itemsCount} carte(s), visibilité ${w.visibility}`)
        ),
    ];

    return textResult(lines.length > 0 ? `${lines.length} wishlist(s) :\n\n${lines.join("\n")}` : "Aucune wishlist.");
}

async function handleGetWishlist(
    args: { wishlistId: string; search?: string; page?: number },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);

    const wishlist = await getWishlistById(args.wishlistId);
    // Une wishlist privée inaccessible est indistinguable d'une wishlist
    // inexistante (anti-énumération d'IDs, comme les routes API).
    const access = wishlist ? await getWishlistAccess(wishlist, userId) : null;
    if (!wishlist || !access?.canView) return errorResult("Wishlist non trouvée.");

    const page = Math.max(1, args.page ?? 1);
    const [items, order] = await Promise.all([
        getWishlistItems(args.wishlistId, {
            search: args.search,
            page,
            limit: 30,
            viewerId: userId,
        }),
        // Le lien « Acheter sur CardNexus » de la page : la liste entière, pas
        // la page ni la recherche (cf. lib/wishlists/cardnexus-order.ts).
        getWishlistCardnexusOrder(args.wishlistId),
    ]);

    const orderText = order.url
        ? `\n\nAcheter sur CardNexus (${order.matched}/${order.total} carte(s) de la liste, lien affilié Joutes) : ${order.url}`
        : "";

    const itemsText = items.items.map(item =>
        `- ${item.name} (${item.setCode} #${item.collectorNumber}) ×${item.quantity}${item.gameName ? ` — ${item.gameName}` : ""}${typeof item.ownedQuantity === "number" && item.ownedQuantity > 0 ? ` (possédée ×${item.ownedQuantity})` : ""}${item.note ? ` — note : ${item.note}` : ""} [ID: ${item.id}]`
    ).join("\n");

    return textResult(
        `Wishlist **${wishlist.name}** (${wishlist.itemsCount} carte(s), visibilité ${wishlist.visibility})${wishlist.description ? ` — ${wishlist.description}` : ""}\nPage ${items.page}/${items.totalPages} :\n\n${itemsText || "Aucune carte."}${orderText}`
    );
}

async function handleCreateWishlist(
    args: { name: string; description?: string; visibility?: "private" | "unlisted" | "public"; playGroupId?: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const resolved = await resolveOwner(userId, args.playGroupId);
    if ("error" in resolved) return resolved.error;

    try {
        const wishlist = await createWishlist(resolved.owner, {
            name: args.name,
            description: args.description,
            visibility: args.visibility,
        });
        return textResult(`Wishlist **${wishlist.name}** créée (ID: ${wishlist.id}).` + linkLine(mcpLinks.wishlist(wishlist.id)));
    } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Erreur lors de la création de la wishlist.");
    }
}

/** Vérifie l'accès en édition à une wishlist et la renvoie. */
async function requireEditableWishlist(
    wishlistId: string,
    userId: string
): Promise<{ wishlist: Wishlist } | { error: ToolResult }> {
    const wishlist = await getWishlistById(wishlistId);
    // Une wishlist privée inaccessible est indistinguable d'une wishlist
    // inexistante (anti-énumération d'IDs, comme les routes API). Le refus
    // d'édition n'est explicité que si la wishlist est au moins visible.
    const access = wishlist ? await getWishlistAccess(wishlist, userId) : null;
    if (!wishlist || !access?.canView) {
        return { error: errorResult("Wishlist non trouvée.") };
    }
    if (!access.canEdit) {
        return { error: errorResult("Vous n'avez pas le droit de modifier cette wishlist.") };
    }
    return { wishlist };
}

async function handleAddCardToWishlist(
    args: { wishlistId: string; gameName: string; cardName: string; setCode?: string; collectorNumber?: string; quantity?: number; note?: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const editable = await requireEditableWishlist(args.wishlistId, userId);
    if ("error" in editable) return editable.error;

    const game = await resolveGame(args.gameName);
    if (!game) return errorResult(`Jeu "${args.gameName}" non trouvé.`);

    const cardResult = await resolveCard(game._id, args.cardName, args.setCode, args.collectorNumber);
    if ("error" in cardResult) return cardResult.error;
    const card = cardResult.card;

    const item = await addWishlistItem(
        args.wishlistId,
        {
            cardId: card.id,
            gameId: game._id.toString(),
            gameName: game.name,
            gameSlug: game.slug,
            name: card.name,
            setCode: card.setCode,
            collectorNumber: String(card.collectorNumber ?? ""),
            image: card.image ?? "",
            quantity: Math.min(Math.max(args.quantity ?? 1, 1), 100),
            note: args.note,
        },
        userId
    );

    return textResult(
        `**${card.name}** (${card.setCode} #${card.collectorNumber}) ajoutée à la wishlist « ${editable.wishlist.name} » (quantité totale : ${item.quantity}).` +
        linkLine(mcpLinks.wishlist(editable.wishlist.id))
    );
}

async function handleRemoveCardFromWishlist(
    args: { wishlistId: string; itemId?: string; cardName?: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const editable = await requireEditableWishlist(args.wishlistId, userId);
    if ("error" in editable) return editable.error;

    let itemId = args.itemId;
    let itemName = "";
    if (!itemId) {
        if (!args.cardName) {
            return errorResult("Précisez itemId ou cardName pour retirer une carte.");
        }
        const docs = await db.collection("wishlist-items")
            .find({
                wishlistId: new ObjectId(args.wishlistId),
                name: { $regex: `^${escapeRegex(args.cardName)}$`, $options: "i" },
            })
            .limit(10)
            .toArray();
        if (docs.length === 0) {
            return errorResult(`Aucune carte "${args.cardName}" dans cette wishlist.`);
        }
        // Plusieurs items peuvent partager un nom (jeux ou impressions
        // différents) : on refuse de choisir arbitrairement.
        if (docs.length > 1) {
            return errorResult(
                `Plusieurs cartes "${args.cardName}" dans cette wishlist. Précisez itemId parmi :\n` +
                docs.map(d => `- ${d.name} (${d.setCode} #${d.collectorNumber}${d.gameName ? `, ${d.gameName}` : ""}) [ID: ${d._id.toString()}]`).join("\n")
            );
        }
        itemId = docs[0]._id.toString();
        itemName = docs[0].name as string;
    }

    const removed = await removeWishlistItem(args.wishlistId, itemId);
    if (!removed) return errorResult("Carte non trouvée dans cette wishlist.");
    return textResult(
        `Carte ${itemName ? `**${itemName}** ` : ""}retirée de la wishlist « ${editable.wishlist.name} ».` +
        linkLine(mcpLinks.wishlist(editable.wishlist.id))
    );
}

// --- Groupes de jeu ---

async function handleListPlayGroups(_args: Record<string, never>, extra: ToolExtra): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const groups = await getPlayGroupsForUser(userId);
    if (groups.length === 0) return textResult("Vous n'appartenez à aucun groupe de jeu.");

    const memberIds = [...new Set(groups.flatMap(g => g.members.map(m => m.userId)))];
    const users = await getUsersByIds(memberIds);
    const usersById = new Map(users.map(u => [u.id, u]));

    const groupsText = groups.map(group => {
        const role = group.members.find(m => m.userId === userId)?.role ?? "member";
        const membersText = group.members
            .map(m => {
                const user = usersById.get(m.userId);
                return `${user?.displayName || user?.username || m.userId} (${m.role})`;
            })
            .join(", ");
        return `**${group.name}** (ID: ${group.id}) — votre rôle : ${role}${group.description ? `\n${group.description}` : ""}\nMembres : ${membersText}`;
    }).join("\n\n");

    return textResult(`${groups.length} groupe(s) de jeu :\n\n${groupsText}`);
}

async function handleCreatePlayGroup(
    args: { name: string; description?: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const group = await createPlayGroup({ name: args.name, description: args.description, ownerId: userId });
    return textResult(`Groupe de jeu **${group.name}** créé (ID: ${group.id}).` + linkLine(mcpLinks.playGroup(group.id)));
}

async function handleInviteToPlayGroup(
    args: { playGroupId: string; userIdentifier: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const group = await getPlayGroupByIdAndUser(args.playGroupId, userId);
    if (!group) return errorResult("Groupe de jeu introuvable ou vous n'en êtes pas membre.");

    const requester = group.members.find(m => m.userId === userId);
    if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
        return errorResult("Seuls le propriétaire et les admins du groupe peuvent inviter des membres.");
    }

    const identifier = args.userIdentifier.trim();
    const targetUser = identifier.includes("@")
        ? await getUserByEmail(identifier)
        : await getUserByTagOrId(identifier);
    if (!targetUser) return errorResult(`Utilisateur "${identifier}" introuvable.`);

    if (group.members.some(m => m.userId === targetUser.id)) {
        return errorResult("Cet utilisateur est déjà membre du groupe.");
    }

    await createPlayGroupInvitation({
        playGroupId: group.id,
        playGroupName: group.name,
        invitedUserId: targetUser.id,
        invitedById: userId,
    });

    return textResult(
        `Invitation envoyée à **${targetUser.displayName || targetUser.username}** pour rejoindre « ${group.name} ».` +
        linkLine(mcpLinks.playGroup(group.id))
    );
}

// --- Tournois ---

const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
    "draft": "brouillon",
    "in-progress": "en cours",
    "completed": "terminé",
};

async function handleListTournaments(_args: Record<string, never>, extra: ToolExtra): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const [organized, playing] = await Promise.all([
        listTournamentsForUser(userId),
        listPlayerTournamentsForUser(userId),
    ]);
    const organizedIds = new Set(organized.map(t => t.id));

    const organizedText = organized.map(t =>
        `- **${t.name}** (ID: ${t.id}) — ${TOURNAMENT_STATUS_LABELS[t.status] ?? t.status}${t.joinCode ? `, code : ${t.joinCode}` : ""}`
    ).join("\n");
    const playingText = playing
        .filter(({ tournament }) => !organizedIds.has(tournament.id))
        .map(({ tournament, player }) =>
            `- **${tournament.name}** (ID: ${tournament.id}) — ${TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}, inscrit comme ${player.displayName}`
        ).join("\n");

    if (!organizedText && !playingText) return textResult("Aucun tournoi.");
    return textResult(
        `${organizedText ? `Tournois que vous gérez :\n${organizedText}` : ""}${organizedText && playingText ? "\n\n" : ""}${playingText ? `Tournois où vous jouez :\n${playingText}` : ""}`
    );
}

/** Un tournoi par son id, sinon par son code de participation. */
async function findTournament(idOrJoinCode: string): Promise<Tournament | null> {
    const value = idOrJoinCode.trim();
    return ObjectId.isValid(value)
        ? getTournamentById(value)
        : getTournamentByJoinCode(value);
}

/** Le staff gère le tournoi depuis le portail organisateur, les joueurs depuis le leur. */
function tournamentLink(tournament: Tournament, userId: string): string {
    return canManageTournament(tournament, userId)
        ? mcpLinks.tournament(tournament.id)
        : mcpLinks.tournamentPlayer(tournament.id);
}

async function handleGetTournament(
    args: { tournamentIdOrJoinCode: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await findTournament(args.tournamentIdOrJoinCode);
    if (!tournament) return errorResult("Tournoi non trouvé.");

    await assertCanReadTournament(tournament, userId);

    const [players, phases, standings, rounds] = await Promise.all([
        listPlayers(tournament.id),
        listPhases(tournament.id),
        getStandings(tournament.id),
        listRounds(tournament.id),
    ]);
    const activePhase = resolveDisplayPhase(phases, tournament.currentPhaseId);
    const currentRound = resolveCurrentRound(rounds, activePhase?.id);

    const phasesText = phases.map(p => {
        // Le rythme d'une phase change complètement la lecture du tournoi : en
        // asynchrone, chaque ronde est un intervalle. Exprimé en jours quand il
        // en fait au moins un, en heures sinon — arrondir un intervalle de 6 h
        // afficherait « 0 j ».
        const pacing = p.pacing === "asynchronous"
            ? p.intervalHours >= 24
                ? `, intervalles de ${Math.round(p.intervalHours / 24)} j`
                : `, intervalles de ${p.intervalHours} h`
            : "";
        return `- ${p.name} (${p.type}, ${p.status}${pacing}) — ${plannedRoundsLabel(p)}`;
    }).join("\n");
    const playersText = players.map(p => {
        const sanitized = sanitizePlayer(p);
        return `- ${playerLabel(sanitized)} (${sanitized.status})`;
    }).join("\n");
    const standingsText = standings.slice(0, 20).map((s, index) => {
        // Une phase puzzle se classe au temps : les points et le bilan y sont
        // tous à zéro, seul le chronomètre dit quelque chose.
        const time = s.puzzleTimeSeconds !== undefined
            ? `, puzzle en ${formatDuration(s.puzzleTimeSeconds)}`
            : "";
        return `${index + 1}. ${s.displayName} — ${s.matchPoints} pts (${s.wins}V/${s.losses}D${s.draws ? `/${s.draws}N` : ""})${time}`;
    }).join("\n");

    return textResult(
        `**${tournament.name}** (ID: ${tournament.id}) — ${TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}${tournament.joinCode ? `, code de participation : ${tournament.joinCode}` : ""}\n` +
        `${describeRound(activePhase, currentRound)}\n\n` +
        `Phases (${phases.length}) :\n${phasesText || "Aucune phase."}\n\n` +
        `Joueurs (${players.length}) :\n${playersText || "Aucun joueur."}\n\n` +
        `Classement :\n${standingsText || "Aucun classement."}` +
        linkLine(tournamentLink(tournament, userId))
    );
}

/**
 * Le tournoi dont parle l'utilisateur quand il n'en nomme aucun : celui qu'il
 * joue en ce moment. S'il en joue plusieurs à la fois, on ne choisit pas à sa
 * place — mauvaise table, mauvais adversaire —, on les liste.
 */
async function resolveCurrentTournament(userId: string): Promise<{ tournament: Tournament } | { result: ToolResult }> {
    const playing = (await listPlayerTournamentsForUser(userId))
        .filter(({ tournament, player }) => tournament.status === "in-progress" && player.status !== "dropped");
    if (playing.length === 1) return { tournament: playing[0].tournament };
    if (playing.length > 1) {
        const list = playing
            .map(({ tournament }) => `- **${tournament.name}** (ID: ${tournament.id})`)
            .join("\n");
        return { result: textResult(`Vous jouez plusieurs tournois en cours. Précisez lequel (tournamentIdOrJoinCode) :\n${list}`) };
    }

    const managed = (await listTournamentsForUser(userId)).filter(t => t.status === "in-progress");
    if (managed.length === 1) return { tournament: managed[0] };
    if (managed.length > 1) {
        const list = managed.map(t => `- **${t.name}** (ID: ${t.id})`).join("\n");
        return { result: textResult(`Vous gérez plusieurs tournois en cours. Précisez lequel (tournamentIdOrJoinCode) :\n${list}`) };
    }
    return {
        result: textResult("Aucun tournoi en cours où vous êtes inscrit. `list_tournaments` liste vos tournois, passés et à venir."),
    };
}

async function handleGetMyTournamentStatus(
    args: { tournamentIdOrJoinCode?: string },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    let tournament: Tournament | null;
    if (args.tournamentIdOrJoinCode?.trim()) {
        tournament = await findTournament(args.tournamentIdOrJoinCode);
        if (!tournament) return errorResult("Tournoi non trouvé.");
    } else {
        const resolved = await resolveCurrentTournament(userId);
        if ("result" in resolved) return resolved.result;
        tournament = resolved.tournament;
    }

    await assertCanReadTournament(tournament, userId);

    const [players, phases, rounds, standings] = await Promise.all([
        listPlayers(tournament.id),
        listPhases(tournament.id),
        listRounds(tournament.id),
        getStandings(tournament.id),
    ]);
    // Un compte ne s'inscrit qu'une fois, mais un ancien retrait ne doit pas
    // masquer une inscription active.
    const mine = players.filter(p => p.userId === userId);
    const me = mine.find(p => p.status !== "dropped") ?? mine[0] ?? null;

    // Mêmes repères que le portail joueur : la phase affichée et sa ronde.
    const activePhase = resolveDisplayPhase(phases, tournament.currentPhaseId);
    const currentRound = resolveCurrentRound(rounds, activePhase?.id);
    const [roundMatches, puzzleSeats] = await Promise.all([
        currentRound ? listMatchesByRound(tournament.id, currentRound.id) : Promise.resolve([]),
        me && activePhase?.type === "time-race" ? listPuzzleSeats(tournament.id, activePhase.id) : Promise.resolve([]),
    ]);

    return textResult(
        describeTournamentStatus({
            tournament,
            phases,
            activePhase,
            currentRound,
            roundMatches,
            players,
            standings,
            me,
            puzzleSeat: me ? puzzleSeats.find(seat => seat.playerId === me.id) ?? null : null,
        }) +
        `\n\nID du tournoi : ${tournament.id}` +
        linkLine(me ? mcpLinks.tournamentPlayer(tournament.id) : tournamentLink(tournament, userId))
    );
}

// --- Tournois : outils de l'organisation ---
//
// Mêmes opérations que le portail organisateur, et mêmes suites : journal
// d'activité et notifications aux joueurs, comme les routes de l'API.

/** Le tournoi, à condition que l'utilisateur en soit organisateur ou arbitre. */
async function requireManagedTournament(idOrJoinCode: string, userId: string): Promise<Tournament> {
    const tournament = await findTournament(idOrJoinCode);
    if (!tournament) throw new TournamentError("not-found", "Tournoi non trouvé.");
    assertCanManage(tournament, userId);
    return tournament;
}

/** La ronde demandée (par numéro, dans la phase affichée), sinon la ronde courante. */
async function resolveRound(tournament: Tournament, roundNumber?: number) {
    const [phases, rounds] = await Promise.all([listPhases(tournament.id), listRounds(tournament.id)]);
    const phase = resolveDisplayPhase(phases, tournament.currentPhaseId);
    const round = roundNumber !== undefined
        ? rounds.find(r => r.phaseId === phase?.id && r.number === roundNumber) ?? null
        : resolveCurrentRound(rounds, phase?.id);
    return { phase: round ? phases.find(p => p.id === round.phaseId) ?? phase : phase, round };
}

async function handleGetTournamentRound(
    args: { tournamentIdOrJoinCode: string; roundNumber?: number },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await requireManagedTournament(args.tournamentIdOrJoinCode, userId);
    const { phase, round } = await resolveRound(tournament, args.roundNumber);
    if (!round) {
        return textResult(
            args.roundNumber !== undefined
                ? `Pas de ronde ${args.roundNumber} dans la phase ${phase?.name ?? "courante"}.`
                : describeRound(phase, null)
        );
    }
    const [matches, players] = await Promise.all([
        listMatchesByRound(tournament.id, round.id),
        listPlayers(tournament.id),
    ]);
    return textResult(
        `**${tournament.name}** (ID: ${tournament.id})\n` +
        describeRoundMatches(phase, round, matches, players) +
        linkLine(mcpLinks.tournamentRound(tournament.id, round.id))
    );
}

/** Le match visé : par son id, sinon par sa table dans la ronde courante. */
async function resolveMatch(
    tournament: Tournament,
    ref: { matchId?: string; tableNumber?: number }
): Promise<TournamentMatch> {
    if (ref.matchId) {
        const match = await getMatchById(tournament.id, ref.matchId);
        if (!match) throw new TournamentError("not-found", "Match non trouvé.");
        return match;
    }
    if (ref.tableNumber === undefined) {
        throw new TournamentError("invalid", "Indiquez la table (tableNumber) ou l'id du match (matchId).");
    }
    const { round } = await resolveRound(tournament);
    if (!round) throw new TournamentError("not-found", "Aucune ronde en cours.");
    const match = (await listMatchesByRound(tournament.id, round.id)).find(m => m.tableNumber === ref.tableNumber);
    if (!match) throw new TournamentError("not-found", `Pas de match à la table ${ref.tableNumber} dans la ronde ${round.number}.`);
    return match;
}

async function handleReportTournamentMatchResult(
    args: {
        tournamentIdOrJoinCode: string;
        tableNumber?: number;
        matchId?: string;
        outcome: "played" | "forfeit" | "double-loss";
        results?: { player: string; gamesWon: number }[];
        draws?: number;
        winner?: string;
    },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await requireManagedTournament(args.tournamentIdOrJoinCode, userId);
    const match = await resolveMatch(tournament, args);
    const players = await listPlayers(tournament.id);
    const inMatch = players.filter(p => match.players.some(mp => mp.playerId === p.id));
    const actor = await buildMatchActor(tournament, { kind: "user", userId });

    let updated: TournamentMatch;
    if (args.outcome === "played") {
        const phase = await getPhaseById(tournament.id, match.phaseId);
        if (phase?.resultMode === "points") {
            return errorResult("Cette phase se rapporte aux points par partie : saisissez le résultat depuis le site.");
        }
        if (!args.results?.length) {
            return errorResult("Indiquez le nombre de parties gagnées par chaque joueur (results).");
        }
        // Une partie par manche gagnée, puis les nuls : l'ordre des parties ne
        // change ni le vainqueur ni le score.
        const games: TournamentGameResult[] = [];
        for (const result of args.results) {
            const lookup = findTournamentPlayer(inMatch, result.player);
            if ("error" in lookup) return errorResult(`${lookup.error} (joueurs du match : ${inMatch.map(playerLabel).join(", ")})`);
            for (let i = 0; i < result.gamesWon; i++) games.push({ winnerId: lookup.player.id });
        }
        for (let i = 0; i < (args.draws ?? 0); i++) games.push({ winnerId: null });
        if (games.length === 0) return errorResult("Aucune partie à enregistrer.");

        updated = await reportMatchResult(tournament, match.id, { games }, actor);
        await recordActivity(tournament.id, "match-reported", { table: updated.tableNumber ?? 0 }, actor.label);
    } else {
        let winnerId: string | null = null;
        if (args.outcome === "forfeit") {
            if (!args.winner) return errorResult("Indiquez le vainqueur du forfait (winner).");
            const lookup = findTournamentPlayer(inMatch, args.winner);
            if ("error" in lookup) return errorResult(lookup.error);
            winnerId = lookup.player.id;
        }
        updated = await forfeitMatch(tournament, match.id, { winnerId }, actor);
        await recordActivity(
            tournament.id,
            "match-forfeited",
            { table: updated.tableNumber ?? 0, doubleLoss: winnerId ? 0 : 1 },
            actor.label
        );
    }
    if (updated.status === "completed") await notifyRoundCompleteIfDone(tournament, updated.roundId);

    const { phase, round } = await resolveRound(tournament);
    const roundText = round && round.id === updated.roundId
        ? describeRoundMatches(phase, round, await listMatchesByRound(tournament.id, round.id), players)
        : "";
    return textResult(
        `Résultat enregistré${updated.tableNumber !== undefined ? ` à la table ${updated.tableNumber}` : ""}.` +
        (roundText ? `\n\n${roundText}` : "") +
        linkLine(mcpLinks.tournamentRound(tournament.id, updated.roundId))
    );
}

async function handleStartNextRound(
    args: { tournamentIdOrJoinCode: string; nextPhase?: boolean },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await requireManagedTournament(args.tournamentIdOrJoinCode, userId);
    let created: Awaited<ReturnType<typeof createNextRound>>;
    if (args.nextPhase) {
        created = await advanceToNextPhase(tournament.id, userId);
        await recordActivity(tournament.id, "phase-advanced", { matches: created.matches.length });
    } else {
        const { phase } = await resolveRound(tournament);
        if (!phase) return errorResult("Le tournoi n'a aucune phase : créez-en une depuis le site.");
        try {
            created = await createNextRound(tournament.id, phase.id, userId);
        } catch (error) {
            // La dernière ronde prévue est passée : la suite est la phase suivante.
            if (error instanceof TournamentError && error.code === "conflict" && /Toutes les rondes|terminée/.test(error.message)) {
                return errorResult(`${error.message}. Pour passer à la phase suivante, rappelez l'outil avec nextPhase: true.`);
            }
            throw error;
        }
        await recordActivity(tournament.id, "round-created", {
            round: created.round.number,
            matches: created.matches.length,
        });
    }

    const players = await listPlayers(tournament.id);
    // Comme la route de l'API : l'appariement se dit aux joueurs, sans bloquer.
    try {
        await notifyRoundPaired(tournament, created.round, created.matches, players);
    } catch (error) {
        console.error("[MCP] Notification d'appariement échouée", error);
    }
    const phase = await getPhaseById(tournament.id, created.round.phaseId);
    return textResult(
        `Ronde lancée.\n\n${describeRoundMatches(phase, created.round, created.matches, players)}` +
        linkLine(mcpLinks.tournamentRound(tournament.id, created.round.id))
    );
}

const PLAYER_ACTIONS = {
    "drop": { updates: { status: "dropped" }, activity: "player-dropped", done: "retiré du tournoi" },
    "reinstate": { updates: { status: "registered" }, activity: "player-reregistered", done: "réinscrit" },
    "confirm": { updates: { status: "registered" }, activity: null, done: "inscription confirmée" },
    "check-in": { updates: { checkedIn: true }, activity: "player-checked-in", done: "pointé présent" },
    "undo-check-in": { updates: { checkedIn: false }, activity: null, done: "pointage annulé" },
} as const;

async function handleUpdateTournamentPlayer(
    args: { tournamentIdOrJoinCode: string; player: string; action: keyof typeof PLAYER_ACTIONS },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await requireManagedTournament(args.tournamentIdOrJoinCode, userId);
    const lookup = findTournamentPlayer(await listPlayers(tournament.id), args.player);
    if ("error" in lookup) return errorResult(lookup.error);

    const action = PLAYER_ACTIONS[args.action];
    if (args.action === "reinstate" && lookup.player.status !== "dropped") {
        return errorResult(`${playerLabel(lookup.player)} n'est pas retiré du tournoi.`);
    }
    if (args.action === "confirm" && lookup.player.status !== "pre-registered") {
        return errorResult(`${playerLabel(lookup.player)} n'est pas en pré-inscription.`);
    }
    const player = await updatePlayer(tournament.id, lookup.player.id, { ...action.updates });
    if (action.activity) await recordActivity(tournament.id, action.activity, { player: player.displayName });

    return textResult(
        `${playerLabel(player)} : ${action.done}.` +
        linkLine(mcpLinks.tournamentPlayerSheet(tournament.id, player.id))
    );
}

async function handleControlTournamentTimer(
    args: { tournamentIdOrJoinCode: string; action: "start" | "pause" | "resume" | "stop"; minutes?: number },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await requireManagedTournament(args.tournamentIdOrJoinCode, userId);
    let updated: Tournament;
    switch (args.action) {
        case "start":
            if (!args.minutes) return errorResult("Indiquez la durée du minuteur en minutes (minutes).");
            updated = await startTimer(tournament.id, Math.round(args.minutes * 60));
            break;
        case "pause":
            updated = await pauseTimer(tournament.id);
            break;
        case "resume":
            updated = await resumeTimer(tournament.id);
            break;
        case "stop":
            updated = await stopTimer(tournament.id);
            break;
    }
    const timer = updated.timer;
    const state = !timer || (!timer.running && timer.remainingSeconds === undefined)
        ? "Minuteur arrêté."
        : timer.running && timer.endsAt
            ? `Minuteur lancé, fin à ${timer.endsAt.toISOString()} (${formatDuration((timer.endsAt.getTime() - Date.now()) / 1000)} restantes).`
            : `Minuteur en pause, ${formatDuration(timer.remainingSeconds ?? 0)} restantes.`;
    return textResult(state + linkLine(mcpLinks.tournamentLive(tournament.id)));
}

async function handleSendTournamentAnnouncement(
    args: { tournamentIdOrJoinCode: string; message: string; urgent?: boolean },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await requireManagedTournament(args.tournamentIdOrJoinCode, userId);
    const level = args.urgent ? "urgent" : "info";
    const announcement = await createAnnouncement(tournament.id, { message: args.message, level, createdBy: userId });
    await recordActivity(tournament.id, "announcement-sent", { level });
    try {
        await notifyAnnouncement(tournament, announcement, await listPlayers(tournament.id));
    } catch (error) {
        console.error("[MCP] Notification d'annonce échouée", error);
    }
    return textResult(
        `Annonce${args.urgent ? " urgente" : ""} envoyée aux joueurs de « ${tournament.name} ».` +
        linkLine(mcpLinks.tournamentLive(tournament.id))
    );
}

async function handleCreateTournament(
    args: { name: string; gameName?: string; allowSelfReporting?: boolean; requireConfirmation?: boolean; preRegistration?: boolean },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    let gameId: string | undefined;
    if (args.gameName) {
        const game = await resolveGame(args.gameName);
        if (!game) return errorResult(`Jeu "${args.gameName}" non trouvé.`);
        gameId = game._id.toString();
    }

    const tournament = await createTournament({
        name: args.name,
        gameId,
        settings: {
            allowSelfReporting: args.allowSelfReporting ?? true,
            requireConfirmation: args.requireConfirmation ?? true,
            preRegistration: args.preRegistration ?? false,
        },
        createdBy: userId,
    });

    return textResult(
        `Tournoi **${tournament.name}** créé (ID: ${tournament.id}, code de participation : ${tournament.joinCode}).` +
        linkLine(mcpLinks.tournament(tournament.id))
    );
}

async function handleUpdateTournament(
    args: { tournamentId: string; name?: string; status?: "draft" | "in-progress" | "completed" },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await getTournamentById(args.tournamentId);
    if (!tournament) return errorResult("Tournoi non trouvé.");
    assertCanManage(tournament, userId);

    if (args.name === undefined && args.status === undefined) {
        return errorResult("Rien à modifier : précisez name et/ou status.");
    }

    const updated = await updateTournament(args.tournamentId, {
        name: args.name,
        status: args.status,
    });

    return textResult(
        `Tournoi **${updated.name}** mis à jour (statut : ${TOURNAMENT_STATUS_LABELS[updated.status] ?? updated.status}).` +
        linkLine(mcpLinks.tournament(updated.id))
    );
}

async function handleAddTournamentPlayer(
    args: { tournamentId: string; identifier: string; seed?: number },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const tournament = await getTournamentById(args.tournamentId);
    if (!tournament) return errorResult("Tournoi non trouvé.");
    assertCanManage(tournament, userId);

    const player = await addPlayerByIdentifier(args.tournamentId, {
        identifier: args.identifier,
        seed: args.seed,
        addedBy: userId,
    });
    const sanitized = sanitizePlayer(player);

    return textResult(
        `Joueur **${sanitized.displayName}${sanitized.discriminator ? `#${sanitized.discriminator}` : ""}** ajouté au tournoi « ${tournament.name} » (statut : ${sanitized.status}).` +
        linkLine(mcpLinks.tournamentPlayers(tournament.id))
    );
}

// --- Deck checker ---

function formatDeckSection(title: string, cards: DeckListCard[]): string {
    if (cards.length === 0) return "";
    const lines = cards.map(card => {
        const flags = [
            card.recognized === false ? "⚠ non reconnue" : "",
            card.banned ? "🚫 bannie" : "",
            card.erratas && card.erratas.length > 0 ? `${card.erratas.length} errata(s)` : "",
        ].filter(Boolean).join(", ");
        return `- ${card.quantity}× ${card.name}${flags ? ` (${flags})` : ""}`;
    });
    const total = cards.reduce((sum, card) => sum + card.quantity, 0);
    return `**${title}** (${total}) :\n${lines.join("\n")}`;
}

async function handleCheckDeck(args: { deckList: string; gameName?: string }): Promise<ToolResult> {
    if (args.gameName) {
        const game = await resolveGame(args.gameName);
        if (!game || game.slug !== "riftbound") {
            return errorResult("Le deck-checker n'est disponible que pour Riftbound.");
        }
    }

    const input = args.deckList.trim();
    let parsed: DeckList;
    try {
        if (input.startsWith("https://piltoverarchive.com/decks/view/")) {
            parsed = await getDeckFromPiltover(input.split("/").at(-1)!);
        } else if (!input.includes(" ")) {
            parsed = await getDeckFromPiltoverCode(input);
        } else {
            parsed = parseDeckList(input);
        }
    } catch {
        return errorResult("Impossible de lire cette liste de deck (texte, code ou lien Piltover Archive attendus).");
    }

    const validated = await validateDeckList(parsed);
    // Un code de deck ne s'écrit qu'avec des cartes reconnues : avec une carte
    // inconnue, le lien rouvre le vérificateur sur la liste en texte.
    let code: string | undefined;
    try {
        code = serializeDeckList(validated);
    } catch {
        code = undefined;
    }

    const allCards = [
        ...validated.champions,
        ...validated.legends,
        ...validated.maindeck,
        ...validated.sideboard,
        ...validated.battlefields,
        ...validated.runes,
    ];
    const unrecognized = allCards.filter(card => card.recognized === false);
    const banned = allCards.filter(card => card.banned);
    const issues = [
        unrecognized.length > 0 ? `${unrecognized.length} carte(s) non reconnue(s)` : "",
        banned.length > 0 ? `${banned.length} carte(s) bannie(s)` : "",
    ].filter(Boolean).join(", ");

    const sections = [
        formatDeckSection("Champions", validated.champions),
        formatDeckSection("Légendes", validated.legends),
        formatDeckSection("Deck principal", validated.maindeck),
        formatDeckSection("Réserve", validated.sideboard),
        formatDeckSection("Champs de bataille", validated.battlefields),
        formatDeckSection("Runes", validated.runes),
    ].filter(Boolean).join("\n\n");

    const url = `https://joutes.app/games/riftbound/deck-checker?input=${encodeURIComponent(code ?? stringifyDeckList(validated))}`;
    const structuredContent: DeckCheckResult = { deck: deckForView(validated), code, url };

    return {
        ...textResult(
            `Deck vérifié${issues ? ` — problèmes : ${issues}` : " — aucun problème détecté"}.\n\n${sections}\n\n` +
            `Lien : ${url}${code ? `\nCode : ${code}` : ""}`
        ),
        structuredContent,
    };
}

/**
 * Le deck tel que la vue l'affiche : des erratas, seulement ce qu'elle en lit
 * (pas les traductions, votes ni auteurs), pour garder la réponse légère.
 */
function deckForView(deck: DeckList): DeckViewList {
    const section = (cards: DeckListCard[]): DeckViewCard[] => cards.map(card => ({
        ...card,
        erratas: card.erratas?.map(errata => ({
            id: errata.id,
            type: errata.type,
            details: errata.details,
            source: errata.source,
            errataDate: errata.errataDate,
            deprecatedAt: errata.deprecatedAt,
        })),
    }));
    return {
        champions: section(deck.champions),
        legends: section(deck.legends),
        maindeck: section(deck.maindeck),
        sideboard: section(deck.sideboard),
        battlefields: section(deck.battlefields),
        runes: section(deck.runes),
    };
}

/**
 * Hôtes des illustrations de cartes, que la vue charge : la galerie officielle
 * de Riftbound, celle de RB-TCG-Arena pour les cartes qu'elle n'a pas encore
 * (Arcane), et le stockage de Joutes pour les images déposées. Une image
 * ailleurs est bloquée par le client : la vue affiche alors le nom de la carte.
 */
const CARD_IMAGE_DOMAINS = [
    "https://cmsassets.rgpub.io",
    "https://russeus.github.io",
    "https://*.public.blob.vercel-storage.com",
];

/** La vue MCP App du vérificateur de deck (mcp-apps/deck-check). */
function registerDeckCheckView(server: McpServer) {
    const ui = { csp: { resourceDomains: CARD_IMAGE_DOMAINS }, prefersBorder: true };
    registerAppResource(server, "Vérificateur de deck", DECK_CHECK_VIEW_URI, {
        description: "Deck Riftbound vérifié, affiché comme sur Joutes : cartes, erratas et rulings.",
        _meta: { ui },
    }, async () => ({
        contents: [{
            uri: DECK_CHECK_VIEW_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: DECK_CHECK_VIEW_HTML,
            _meta: { ui },
        }],
    }));
}

// --- Erratas ---

/**
 * Cartes visées par un errata, données par identifiant et/ou par nom dans le
 * jeu. Un errata s'affiche sur toutes les impressions d'une carte de même nom :
 * une seule impression par nom suffit donc, sans demander setCode et
 * collectorNumber comme pour la collection.
 */
async function resolveErrataCardIds(
    gameId: ObjectId,
    cardNames: string[] = [],
    cardIds: string[] = []
): Promise<{ cardIds: string[] } | { error: ToolResult }> {
    const resolved = [...cardIds];
    const missing: string[] = [];

    for (const cardName of cardNames) {
        const card = await db.collection<{ id: string }>("cards").findOne(
            { gameId, name: { $regex: `^${escapeRegex(cardName.trim())}$`, $options: "i" } },
            { projection: { id: 1 }, sort: { setCode: 1, collectorNumber: 1 } }
        );
        if (card) resolved.push(card.id);
        else missing.push(cardName);
    }

    if (missing.length > 0) {
        return { error: errorResult(`Carte(s) introuvable(s) dans ce jeu : ${missing.join(", ")}.`) };
    }

    return { cardIds: resolved };
}

/** Jeu d'un errata, retrouvé par ses cartes : un errata ne porte pas de jeu. */
async function gameOfCards(cardIds: string[]): Promise<(Game & { _id: ObjectId }) | null> {
    const card = await db.collection<{ id: string; gameId: ObjectId }>("cards").findOne(
        { id: { $in: cardIds } },
        { projection: { gameId: 1 } }
    );
    if (!card) return null;
    return db.collection<Game & { _id: ObjectId }>("games").findOne({ _id: card.gameId });
}

/** zod ne dit que « expected date » d'une date illisible : on précise le format. */
function invalidErrataDate(errataDate?: string): ToolResult | null {
    if (errataDate === undefined || !Number.isNaN(Date.parse(errataDate))) return null;
    return errorResult(`Date "${errataDate}" invalide : format attendu ISO 8601, par exemple 2026-10-15.`);
}

function revalidateErrataPages(gameSlug: string | undefined, cardIds: Iterable<string>) {
    for (const cardId of new Set(cardIds)) {
        revalidatePath(`/games/${gameSlug ?? "riftbound"}/cards/${cardId}`);
    }
    revalidatePath("/riftbound/erratas");
}

/**
 * Création ouverte à tout utilisateur connecté, comme depuis l'app : les
 * erratas sont un contenu communautaire, arbitré par les votes et les
 * signalements.
 */
async function handleCreateErrata(
    args: {
        gameName: string;
        cardNames?: string[];
        cardIds?: string[];
        type: ErrataType;
        details: string;
        originalLang?: string;
        source?: string;
        errataDate?: string;
    },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    const game = await resolveGame(args.gameName);
    if (!game) return errorResult(`Jeu "${args.gameName}" non trouvé.`);

    const cards = await resolveErrataCardIds(game._id, args.cardNames, args.cardIds);
    if ("error" in cards) return cards.error;

    const invalidDate = invalidErrataDate(args.errataDate);
    if (invalidDate) return invalidDate;

    // Même schéma que l'API HTTP : mêmes limites de taille, mêmes messages.
    const parsed = createErrataSchema.safeParse({
        cardIds: cards.cardIds,
        type: args.type,
        details: args.details,
        originalLang: args.originalLang,
        source: args.source || undefined,
        errataDate: args.errataDate,
    });
    if (!parsed.success) {
        return errorResult(parsed.error.issues[0]?.message || "Données invalides.");
    }

    const { id, cardIds } = await createErrata({
        ...parsed.data,
        errataDate: parsed.data.errataDate ?? new Date(),
        createdBy: userId,
        gameId: game._id.toString(),
    });

    revalidateErrataPages(game.slug, cardIds);

    return textResult(
        `Errata créé (ID: ${id}, type : ${parsed.data.type}) sur ${cardIds.length} carte(s) de ${game.name}.` +
        linkLine(mcpLinks.errata(id, game.slug ?? game._id.toString(), cardIds[0]))
    );
}

const updateErrataSchema = createErrataSchema
    .pick({ type: true, details: true, source: true, errataDate: true })
    .partial();

/**
 * Modification réservée à l'auteur de l'errata ou à un modérateur (permission
 * `erratas:manage`), comme depuis l'app. Seuls les champs fournis changent.
 */
async function handleUpdateErrata(
    args: {
        errataId: string;
        type?: ErrataType;
        details?: string;
        source?: string;
        errataDate?: string;
        deprecated?: boolean;
        gameName?: string;
        cardNames?: string[];
        cardIds?: string[];
    },
    extra: ToolExtra
): Promise<ToolResult> {
    const userId = userIdFrom(extra);
    if (!userId) return AUTH_REQUIRED;

    if (!ObjectId.isValid(args.errataId)) return errorResult("Identifiant d'errata invalide.");

    const errata = await db.collection<ErrataDb & { cardId?: string }>("erratas").findOne(
        { _id: new ObjectId(args.errataId) },
        { projection: { createdBy: 1, cardIds: 1, cardId: 1 } }
    );
    if (!errata) return errorResult("Errata introuvable.");

    const isAuthor = errata.createdBy?.toString() === userId;
    if (!isAuthor && !(await anyUserHasPermission([userId], "erratas:manage"))) {
        return errorResult("Seul l'auteur de l'errata ou un modérateur peut le modifier.");
    }

    const invalidDate = invalidErrataDate(args.errataDate);
    if (invalidDate) return invalidDate;

    const parsed = updateErrataSchema.safeParse({
        type: args.type,
        details: args.details,
        source: args.source,
        errataDate: args.errataDate,
    });
    if (!parsed.success) {
        return errorResult(parsed.error.issues[0]?.message || "Données invalides.");
    }

    // Les cartes se résolvent dans le jeu de l'errata, ou celui donné en
    // argument : un errata ne passe pas d'un jeu à l'autre par erreur de nom.
    const currentCardIds = errata.cardIds?.length ? errata.cardIds : errata.cardId ? [errata.cardId] : [];
    const errataGame = await gameOfCards(currentCardIds);
    let game = errataGame;
    if (args.gameName) {
        game = await resolveGame(args.gameName);
        if (!game) return errorResult(`Jeu "${args.gameName}" non trouvé.`);
    }

    let cardIds: string[] | undefined;
    if (args.cardNames?.length || args.cardIds?.length) {
        if (!game) return errorResult("Précisez gameName pour résoudre les cartes de cet errata.");
        const cards = await resolveErrataCardIds(game._id, args.cardNames, args.cardIds);
        if ("error" in cards) return cards.error;
        cardIds = cards.cardIds;
    }

    const changes = {
        ...parsed.data,
        cardIds,
        deprecatedAt: args.deprecated === undefined ? undefined : args.deprecated ? new Date() : null,
    };
    if (Object.values(changes).every((value) => value === undefined)) {
        return errorResult("Rien à modifier : précisez au moins un champ.");
    }

    const result = await updateErrataById(args.errataId, {
        ...changes,
        gameId: cardIds ? game?._id.toString() : undefined,
    });
    if (!result) return errorResult("Errata introuvable.");

    const finalGame = game ?? errataGame;
    revalidateErrataPages(finalGame?.slug, [...result.previousCardIds, ...result.cardIds]);

    const firstCardId = result.cardIds[0];
    return textResult(
        `Errata ${args.errataId} mis à jour.` +
        (finalGame && firstCardId
            ? linkLine(mcpLinks.errata(args.errataId, finalGame.slug ?? finalGame._id.toString(), firstCardId))
            : "")
    );
}

// --- Enregistrement des outils ---

export function registerJoutesDataTools(server: McpServer) {
    registerJoutesTool(server, "get_collection", {
        title: "Get card collection",
        description: "Consulter la collection de cartes de l'utilisateur ou d'un de ses groupes de jeu : vue d'ensemble par jeu, ou détail paginé pour un jeu (filtres par set, recherche, cartes possédées uniquement).",
        inputSchema: {
            playGroupId: z.string().optional().describe("Collection partagée de ce groupe de jeu plutôt que la collection personnelle"),
            gameName: z.string().optional().describe("Nom ou slug du jeu pour le détail ; omis = vue d'ensemble"),
            setCode: z.string().optional(),
            search: z.string().optional().describe("Recherche sur le nom des cartes"),
            ownedOnly: z.boolean().optional().describe("Ne lister que les cartes possédées"),
            page: z.number().int().min(1).optional(),
        },
    }, withToolLogging("get_collection", handleGetCollection));
    registerJoutesTool(server, "add_card_to_collection", {
        title: "Add card to collection",
        description: "Ajouter des exemplaires d'une carte à la collection personnelle ou à celle d'un groupe de jeu. La carte est résolue par jeu + nom (précisez setCode/collectorNumber si plusieurs impressions existent).",
        inputSchema: {
            gameName: z.string().describe("Nom ou slug du jeu"),
            cardName: z.string(),
            setCode: z.string().optional(),
            collectorNumber: z.string().optional(),
            quantity: z.number().int().min(1).max(100).optional().describe("Nombre d'exemplaires (défaut 1)"),
            foil: z.boolean().optional(),
            language: collectionLanguage.optional(),
            playGroupId: z.string().optional(),
        },
    }, withToolLogging("add_card_to_collection", handleAddCardToCollection));
    registerJoutesTool(server, "remove_card_from_collection", {
        title: "Remove card from collection",
        description: "Retirer des exemplaires d'une carte de la collection personnelle ou de celle d'un groupe de jeu.",
        inputSchema: {
            gameName: z.string().describe("Nom ou slug du jeu"),
            cardName: z.string(),
            setCode: z.string().optional(),
            collectorNumber: z.string().optional(),
            quantity: z.number().int().min(1).max(100).optional().describe("Nombre d'exemplaires à retirer (défaut 1)"),
            playGroupId: z.string().optional(),
        },
    }, withToolLogging("remove_card_from_collection", handleRemoveCardFromCollection));
    registerJoutesTool(server, "list_wishlists", {
        title: "List wishlists",
        description: "Lister les wishlists de l'utilisateur (personnelles et celles de ses groupes de jeu).",
        inputSchema: {},
    }, withToolLogging("list_wishlists", handleListWishlists));
    registerJoutesTool(server, "get_wishlist", {
        title: "Get wishlist",
        description: "Consulter le contenu d'une wishlist (paginé, avec recherche), avec le lien pour la commander sur CardNexus.",
        inputSchema: {
            wishlistId: z.string(),
            search: z.string().optional(),
            page: z.number().int().min(1).optional(),
        },
    }, withToolLogging("get_wishlist", handleGetWishlist));
    registerJoutesTool(server, "create_wishlist", {
        title: "Create wishlist",
        description: "Créer une wishlist personnelle ou pour un groupe de jeu.",
        inputSchema: {
            name: z.string(),
            description: z.string().optional(),
            visibility: z.enum(["private", "unlisted", "public"]).optional().describe("Défaut : private"),
            playGroupId: z.string().optional(),
        },
    }, withToolLogging("create_wishlist", handleCreateWishlist));
    registerJoutesTool(server, "add_card_to_wishlist", {
        title: "Add card to wishlist",
        description: "Ajouter une carte à une wishlist (résolue par jeu + nom ; ré-ajouter une carte déjà présente incrémente sa quantité).",
        inputSchema: {
            wishlistId: z.string(),
            gameName: z.string().describe("Nom ou slug du jeu"),
            cardName: z.string(),
            setCode: z.string().optional(),
            collectorNumber: z.string().optional(),
            quantity: z.number().int().min(1).max(100).optional(),
            note: z.string().optional(),
        },
    }, withToolLogging("add_card_to_wishlist", handleAddCardToWishlist));
    registerJoutesTool(server, "remove_card_from_wishlist", {
        title: "Remove card from wishlist",
        description: "Retirer une carte d'une wishlist, par identifiant d'item ou par nom de carte.",
        inputSchema: {
            wishlistId: z.string(),
            itemId: z.string().optional(),
            cardName: z.string().optional(),
        },
    }, withToolLogging("remove_card_from_wishlist", handleRemoveCardFromWishlist));
    registerJoutesTool(server, "list_play_groups", {
        title: "List play groups",
        description: "Lister les groupes de jeu de l'utilisateur, avec leurs membres et rôles.",
        inputSchema: {},
    }, withToolLogging("list_play_groups", handleListPlayGroups));
    registerJoutesTool(server, "create_play_group", {
        title: "Create play group",
        description: "Créer un groupe de jeu dont l'utilisateur sera propriétaire.",
        inputSchema: {
            name: z.string(),
            description: z.string().optional(),
        },
    }, withToolLogging("create_play_group", handleCreatePlayGroup));
    registerJoutesTool(server, "invite_to_play_group", {
        title: "Invite to play group",
        description: "Inviter un utilisateur (email, username#0000 ou id) dans un groupe de jeu. Réservé au propriétaire et aux admins du groupe.",
        inputSchema: {
            playGroupId: z.string(),
            userIdentifier: z.string().describe("Email, tag username#0000 ou id de l'utilisateur"),
        },
    }, withToolLogging("invite_to_play_group", handleInviteToPlayGroup));
    registerJoutesTool(server, "list_tournaments", {
        title: "List tournaments",
        description: "Lister les tournois de l'utilisateur : ceux qu'il gère et ceux où il est inscrit comme joueur.",
        inputSchema: {},
    }, withToolLogging("list_tournaments", handleListTournaments));
    registerJoutesTool(server, "get_tournament", {
        title: "Get tournament",
        description: "Consulter un tournoi (phases, joueurs, classement) par son id ou son code de participation. Réservé au staff et aux joueurs inscrits.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string(),
        },
    }, withToolLogging("get_tournament", handleGetTournament));
    registerJoutesTool(server, "get_my_tournament_status", {
        title: "Get my tournament status",
        description:
            "Où en est l'utilisateur dans un tournoi : sa table et son adversaire pour la ronde en cours (avec le résultat du match s'il est rapporté), " +
            "son classement, ses points et son bilan, la ronde en cours et le nombre de rondes prévues par phase. " +
            "Sans tournamentIdOrJoinCode, prend le tournoi en cours où l'utilisateur est inscrit. Lecture seule, réservé aux joueurs inscrits et au staff.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string().optional().describe("Id ou code de participation du tournoi. Facultatif : par défaut, le tournoi en cours de l'utilisateur."),
        },
    }, withToolLogging("get_my_tournament_status", handleGetMyTournamentStatus));
    registerJoutesTool(server, "create_tournament", {
        title: "Create tournament",
        description: "Créer un tournoi (statut brouillon) dont l'utilisateur sera organisateur.",
        inputSchema: {
            name: z.string(),
            gameName: z.string().optional().describe("Nom ou slug du jeu associé"),
            allowSelfReporting: z.boolean().optional().describe("Les joueurs rapportent leurs résultats (défaut true)"),
            requireConfirmation: z.boolean().optional().describe("Confirmation de l'adversaire requise (défaut true)"),
            preRegistration: z.boolean().optional().describe("Mode pré-inscription (défaut false)"),
        },
    }, withToolLogging("create_tournament", handleCreateTournament));
    registerJoutesTool(server, "update_tournament", {
        title: "Update tournament",
        description: "Modifier le nom ou le statut d'un tournoi. Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentId: z.string(),
            name: z.string().optional(),
            status: z.enum(["draft", "in-progress", "completed"]).optional(),
        },
    }, withToolLogging("update_tournament", handleUpdateTournament));
    registerJoutesTool(server, "add_tournament_player", {
        title: "Add tournament player",
        description: "Inscrire un joueur à un tournoi par email, tag username#0000, ou nom libre (invité). Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentId: z.string(),
            identifier: z.string().describe("Email, username#0000, ou nom d'invité"),
            seed: z.number().int().min(1).optional(),
        },
    }, withToolLogging("add_tournament_player", handleAddTournamentPlayer));
    registerJoutesTool(server, "get_tournament_round", {
        title: "Get tournament round",
        description:
            "Organisation d'un tournoi : les tables de la ronde en cours (ou d'une ronde donnée de la phase en cours), avec les joueurs, " +
            "l'état de chaque match (à jouer, rapporté, contesté, résultat) et le nombre de résultats rentrés. Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string(),
            roundNumber: z.number().int().min(1).optional().describe("Numéro de ronde dans la phase en cours. Par défaut, la ronde en cours."),
        },
    }, withToolLogging("get_tournament_round", handleGetTournamentRound));
    registerJoutesTool(server, "report_tournament_match_result", {
        title: "Report tournament match result",
        description:
            "Organisation d'un tournoi : saisir ou corriger le résultat d'un match, désigné par sa table dans la ronde en cours (ou son id). " +
            "outcome \"played\" : parties gagnées par joueur (results) et parties nulles (draws). \"forfeit\" : victoire par forfait de winner. " +
            "\"double-loss\" : double défaite. Le résultat est définitif (pas de confirmation des joueurs). Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string(),
            tableNumber: z.number().int().min(0).optional(),
            matchId: z.string().optional(),
            outcome: z.enum(["played", "forfeit", "double-loss"]).default("played"),
            results: z.array(z.object({
                player: z.string().describe("Pseudo, Pseudo#1234 ou id du joueur de tournoi"),
                gamesWon: z.number().int().min(0),
            })).optional(),
            draws: z.number().int().min(0).optional(),
            winner: z.string().optional().describe("Vainqueur d'un forfait (pseudo, Pseudo#1234 ou id)."),
        },
    }, withToolLogging("report_tournament_match_result", handleReportTournamentMatchResult));
    registerJoutesTool(server, "start_next_round", {
        title: "Start next round",
        description:
            "Organisation d'un tournoi : lancer la ronde suivante de la phase en cours (appariements générés, joueurs notifiés). " +
            "Tous les matchs de la ronde précédente doivent être terminés. Avec nextPhase: true, clôt la phase en cours, applique le top cut " +
            "(les non-qualifiés sont retirés) et lance la première ronde de la phase suivante. Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string(),
            nextPhase: z.boolean().optional(),
        },
    }, withToolLogging("start_next_round", handleStartNextRound));
    registerJoutesTool(server, "update_tournament_player", {
        title: "Update tournament player",
        description:
            "Organisation d'un tournoi : retirer un joueur (drop), le réinscrire (reinstate), confirmer une pré-inscription (confirm), " +
            "le pointer présent (check-in) ou annuler son pointage (undo-check-in). Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string(),
            player: z.string().describe("Pseudo, Pseudo#1234 ou id du joueur de tournoi"),
            action: z.enum(["drop", "reinstate", "confirm", "check-in", "undo-check-in"]),
        },
    }, withToolLogging("update_tournament_player", handleUpdateTournamentPlayer));
    registerJoutesTool(server, "control_tournament_timer", {
        title: "Control tournament timer",
        description:
            "Organisation d'un tournoi : lancer le minuteur de ronde (start, avec minutes), le mettre en pause, le reprendre ou l'arrêter. " +
            "Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string(),
            action: z.enum(["start", "pause", "resume", "stop"]),
            minutes: z.number().positive().max(1440).optional(),
        },
    }, withToolLogging("control_tournament_timer", handleControlTournamentTimer));
    registerJoutesTool(server, "send_tournament_announcement", {
        title: "Send tournament announcement",
        description:
            "Organisation d'un tournoi : publier une annonce sur l'écran du tournoi et la notifier à tous les joueurs inscrits. " +
            "Réservé aux organisateurs et arbitres.",
        inputSchema: {
            tournamentIdOrJoinCode: z.string(),
            message: z.string().min(1).max(500),
            urgent: z.boolean().optional(),
        },
    }, withToolLogging("send_tournament_announcement", handleSendTournamentAnnouncement));
    registerJoutesTool(server, "create_errata", {
        title: "Create errata",
        description: "Proposer un errata, une clarification ou un ruling sur une ou plusieurs cartes d'un jeu. Cartes données par nom (cardNames) et/ou identifiant (cardIds). Ouvert à tout utilisateur connecté ; la communauté arbitre par les votes.",
        inputSchema: {
            gameName: z.string().describe("Nom ou slug du jeu"),
            cardNames: z.array(z.string()).optional().describe("Noms exacts des cartes visées"),
            cardIds: z.array(z.string()).optional().describe("Identifiants des cartes visées"),
            type: z.enum(["errata", "clarification", "ruling"]),
            details: z.string().describe("Contenu de l'errata (Markdown)"),
            originalLang: z.enum(locales).optional().describe("Langue du contenu (défaut : fr)"),
            source: z.string().optional().describe("Lien ou référence de l'annonce officielle"),
            errataDate: z.string().optional().describe("Date de publication par l'éditeur, ISO 8601 (défaut : aujourd'hui)"),
        },
    }, withToolLogging("create_errata", handleCreateErrata));
    registerJoutesTool(server, "update_errata", {
        title: "Update errata",
        description: "Modifier un errata existant ; seuls les champs fournis changent. Réservé à l'auteur de l'errata et aux modérateurs.",
        inputSchema: {
            errataId: z.string(),
            type: z.enum(["errata", "clarification", "ruling"]).optional(),
            details: z.string().optional().describe("Nouveau contenu (Markdown)"),
            source: z.string().optional().describe("Nouvelle source ; chaîne vide pour la retirer"),
            errataDate: z.string().optional().describe("Date de publication par l'éditeur, ISO 8601"),
            deprecated: z.boolean().optional().describe("true pour marquer l'errata obsolète, false pour le rétablir"),
            gameName: z.string().optional().describe("Jeu dans lequel résoudre cardNames (défaut : celui de l'errata)"),
            cardNames: z.array(z.string()).optional().describe("Remplace les cartes visées, par nom"),
            cardIds: z.array(z.string()).optional().describe("Remplace les cartes visées, par identifiant"),
        },
    }, withToolLogging("update_errata", handleUpdateErrata));
    registerDeckCheckView(server);
    registerJoutesTool(server, "check_deck", {
        title: "Check deck legality",
        view: DECK_CHECK_VIEW_URI,
        description: "Vérifier une liste de deck Riftbound : cartes reconnues, bannies, erratas. Accepte une liste texte (« 3 Nom de carte » par ligne), un code de deck, ou un lien Piltover Archive.",
        inputSchema: {
            deckList: z.string().describe("Liste texte, code de deck, ou lien https://piltoverarchive.com/decks/view/..."),
            gameName: z.string().optional().describe("Défaut : riftbound (seul jeu supporté)"),
        },
    }, withToolLogging("check_deck", handleCheckDeck));
}
