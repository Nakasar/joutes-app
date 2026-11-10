/**
 * Les textes des outils MCP du jeu en groupe — bibliothèque de decks,
 * commentaires de deck, résultats de tournoi, méta du groupe — en fonctions
 * pures.
 *
 * Les données viennent des mêmes services que les vues du groupe et l'API
 * mobile (`lib/play-groups/*`, `lib/decks/comment-service.ts`,
 * `lib/tournaments/result-service.ts`) : l'assistant dit ce que l'écran
 * affiche. Ici, on ne fait que ranger et écrire.
 */

import type { CommentThreadPayload } from "@/lib/decks/comment-service";
import type { DeckCommentView } from "@/lib/decks/comments";
import type { GroupMetaPage } from "@/lib/play-groups/meta-data";
import type { MemberPalmares } from "@/lib/play-groups/tournaments";
import { formatRecord } from "@/lib/tournaments/results";
import type { TournamentResult } from "@/lib/types/TournamentResult";
import { day, percent, plural, points, rate } from "./meta";

/** « 1er », « 3e ». */
export function placementLabel(placement: number): string {
    return placement === 1 ? "1er" : `${placement}e`;
}

/** Le texte d'une erreur de service, pour l'assistant. */
const COMMENT_ERRORS: Record<string, string> = {
    UNAUTHENTICATED: "Connexion requise.",
    INVALID: "Espace invalide : `personal` ou un groupe (playGroupId).",
    NOT_FOUND: "Deck ou commentaire introuvable.",
    FORBIDDEN:
        "Accès refusé : le fil d'un groupe est réservé à ses membres tant que le deck y est partagé, " +
        "les notes personnelles à l'auteur du deck.",
    EMPTY: "Le commentaire est vide.",
    TOO_LONG: "Le commentaire dépasse 2 000 caractères.",
    TOO_MANY_CARDS: "Dix cartes liées au plus.",
    CARD_NOT_IN_DECK: "Une carte liée n'est pas dans le deck.",
    REPLY_WITH_CARDS: "Une réponse ne lie pas de cartes : liez-les au commentaire d'origine.",
};

export function commentErrorText(error: string): string {
    return COMMENT_ERRORS[error] ?? `Erreur : ${error}.`;
}

const RESULT_ERRORS: Record<string, string> = {
    UNAUTHENTICATED: "Connexion requise.",
    INVALID: "Données invalides.",
    NOT_FOUND: "Tournoi Joutes introuvable, pas terminé, ou vous n'y étiez ni inscrit ni dans le staff.",
    FORBIDDEN: "Accès refusé.",
    DUPLICATE: "Ce tournoi est déjà dans vos résultats.",
    CLAIMED: "Ce joueur du locator est déjà reconnu par un autre compte.",
    DECK: "Le deck doit être à vous et du jeu du tournoi.",
    NAME: "Le nom du tournoi est requis (120 caractères au plus).",
    DATE: "Date invalide : un tournoi déjà joué (demain au plus tard).",
    GAME: "Jeu introuvable.",
    PLAYER_COUNT: "Nombre de joueurs invalide (2 à 20 000).",
    PLACEMENT: "Classement invalide (il ne peut pas dépasser le nombre de joueurs).",
    TOP_CUT: "Phase finale invalide : 4, 8, 16, 32 ou 64, et au moins votre classement.",
    RECORD: "Bilan invalide : victoires-défaites-nuls, par exemple 5-1-0.",
    VISIBILITY: "Visibilité : `groups` ou `public`.",
};

export function resultErrorText(error: string): string {
    return RESULT_ERRORS[error] ?? `Erreur : ${error}.`;
}

// ---------------------------------------------------------------------------
// Bibliothèque de decks
// ---------------------------------------------------------------------------

export type GroupDeckLine = {
    deckId: string;
    name: string;
    legendName?: string;
    format?: string;
    visibility?: string;
    version?: number;
    ownerName: string;
    gameName?: string;
    pinnedAt?: string;
    pinNote?: string;
};

const VISIBILITY_LABELS: Record<string, string> = {
    public: "public",
    unlisted: "non répertorié",
    private: "privé, visible du groupe",
};

export function describeGroupDeck(line: GroupDeckLine): string {
    const details = [
        line.legendName ?? "sans légende",
        line.format,
        line.gameName,
        `par ${line.ownerName}`,
        line.visibility ? VISIBILITY_LABELS[line.visibility] ?? line.visibility : undefined,
        line.version ? `v${line.version}` : undefined,
    ].filter(Boolean);
    const pin = line.pinnedAt ? ` — épinglé${line.pinNote ? ` : ${line.pinNote}` : ""}` : "";
    return `- **${line.name}** (deckId: ${line.deckId}) — ${details.join(" · ")}${pin}`;
}

export function describeGroupDecks(groupName: string, lines: GroupDeckLine[], total: number): string {
    if (total === 0) return `Aucun deck partagé dans « ${groupName} ».`;
    if (lines.length === 0) return `Aucun deck de « ${groupName} » ne répond à ces filtres (${plural(total, "deck")} au total).`;
    const filtered = lines.length < total ? ` sur ${total}` : "";
    return (
        `${plural(lines.length, "deck")}${filtered} dans la bibliothèque de « ${groupName} », épinglés d'abord :\n\n` +
        lines.map(describeGroupDeck).join("\n") +
        "\n\nLe fil de commentaires d'un deck dans ce groupe : get_deck_comments avec le deckId et le playGroupId."
    );
}

// ---------------------------------------------------------------------------
// Commentaires de deck
// ---------------------------------------------------------------------------

function describeComment(comment: DeckCommentView, thread: CommentThreadPayload, indent: string): string {
    const author = thread.authors[comment.authorId]?.name ?? "Joueur";
    const isNew = thread.lastReadAt && comment.createdAt > thread.lastReadAt ? " — nouveau" : "";
    const older = comment.deckVersion < thread.deckVersion ? ` — écrit sur la v${comment.deckVersion}` : "";
    const head = `${indent}- [${comment.id}] ${author}, ${day(comment.createdAt)}${older}${isNew}`;
    if (comment.deleted) return `${head} : (supprimé)`;

    const cards = comment.cards.length
        ? `\n${indent}  Cartes : ${comment.cards.map((card) => (card.removed ? `${card.name} (plus dans le deck)` : card.name)).join(", ")}`
        : "";
    const resolved = comment.resolvedAt
        ? `\n${indent}  Résolu${comment.resolvedVersion ? ` en v${comment.resolvedVersion}` : ""} le ${day(comment.resolvedAt)}`
        : "";
    const body = comment.body
        .split("\n")
        .map((line) => `${indent}  > ${line}`)
        .join("\n");
    return `${head} :\n${body}${cards}${resolved}`;
}

export function describeCommentThread(thread: CommentThreadPayload, deckName: string, spaceLabel: string): string {
    const roots = thread.comments;
    if (roots.length === 0) {
        return `Aucun commentaire sur « ${deckName} » (${spaceLabel}). add_deck_comment pour écrire le premier.`;
    }
    const open = roots.filter((comment) => !comment.resolvedAt);
    const resolved = roots.filter((comment) => comment.resolvedAt);
    const block = (comments: DeckCommentView[]) =>
        comments
            .map((comment) =>
                [describeComment(comment, thread, ""), ...comment.replies.map((reply) => describeComment(reply, thread, "  "))].join("\n"),
            )
            .join("\n\n");

    return (
        `« ${deckName} » (v${thread.deckVersion}) — ${spaceLabel} : ${plural(open.length, "commentaire ouvert", "commentaires ouverts")}` +
        (resolved.length ? `, ${plural(resolved.length, "résolu")}` : "") +
        ", les plus récents d'abord.\n\n" +
        (open.length ? block(open) : "Rien d'ouvert.") +
        (resolved.length ? `\n\nRésolus :\n\n${block(resolved)}` : "") +
        "\n\nRépondre : add_deck_comment avec parentId = l'identifiant entre crochets."
    );
}

// ---------------------------------------------------------------------------
// Résultats de tournoi
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<TournamentResult["source"], string> = {
    joutes: "tournoi Joutes",
    locator: "locator",
    declared: "déclaré",
};

export function describeResult(result: TournamentResult, gameName?: string, who?: string): string {
    const place =
        result.placement !== undefined
            ? `${placementLabel(result.placement)}${result.playerCount ? `/${result.playerCount}` : ""}${result.topCut ? ` (top ${result.topCut})` : ""}`
            : result.playerCount
              ? `${result.playerCount} joueurs, sans classement`
              : "sans classement";
    const details = [
        place,
        formatRecord(result.record),
        result.legendName,
        gameName ?? result.gameName,
        result.place,
        SOURCE_LABELS[result.source],
        result.visibility === "public" ? "public" : "visible des groupes",
        result.deckId ? `deckId: ${result.deckId}` : undefined,
    ].filter(Boolean);
    return `- ${day(result.date)} — ${who ? `${who} — ` : ""}**${result.name}** : ${details.join(" · ")}`;
}

export function describeMyResults(results: TournamentResult[], gameNameOf: (gameId?: string) => string | undefined): string {
    if (results.length === 0) {
        return "Aucun résultat de tournoi. declare_tournament_result pour en ajouter un.";
    }
    return (
        `${plural(results.length, "résultat")} de tournoi, les plus récents d'abord :\n\n` +
        results.map((result) => describeResult(result, gameNameOf(result.gameId))).join("\n")
    );
}

export type GroupTimelinePage = {
    months: {
        month: string;
        tournaments: {
            name: string;
            date: string;
            place?: string;
            playerCount?: number;
            results: (Pick<TournamentResult, "userId" | "placement" | "legendName"> & Partial<Pick<TournamentResult, "record">>)[];
        }[];
    }[];
    nextBefore?: string;
};

export function describeGroupTournaments(
    groupName: string,
    timeline: GroupTimelinePage,
    palmares: MemberPalmares[],
    nameOf: (userId: string) => string,
): string {
    const tournaments = timeline.months.flatMap((month) => month.tournaments);
    if (tournaments.length === 0) return `Aucun résultat de tournoi des membres de « ${groupName} » pour ces filtres.`;

    const podium = palmares
        .slice(0, 8)
        .map(
            (row) =>
                `- ${nameOf(row.userId)} : ${plural(row.wins, "victoire")}, ${row.topEights} top 8, ${plural(row.tournaments, "tournoi")}`,
        )
        .join("\n");
    const lines = tournaments
        .map((tournament) => {
            const results = [...tournament.results]
                .sort((a, b) => (a.placement ?? 9999) - (b.placement ?? 9999))
                .map((result) => {
                    const details = [
                        result.placement !== undefined ? placementLabel(result.placement) : "sans classement",
                        formatRecord(result.record),
                        result.legendName,
                    ].filter(Boolean);
                    return `  - ${nameOf(result.userId)} : ${details.join(" · ")}`;
                })
                .join("\n");
            const meta = [tournament.place, tournament.playerCount ? `${tournament.playerCount} joueurs` : undefined].filter(Boolean);
            return `- ${day(tournament.date)} — **${tournament.name}**${meta.length ? ` (${meta.join(", ")})` : ""}\n${results}`;
        })
        .join("\n");

    return (
        `Tournois des membres de « ${groupName} », les plus récents d'abord.\n\n` +
        (podium ? `Palmarès :\n${podium}\n\n` : "") +
        `Timeline :\n${lines}` +
        (timeline.nextBefore ? `\n\nMois précédents : before = « ${timeline.nextBefore} ».` : "")
    );
}

// ---------------------------------------------------------------------------
// Méta du groupe
// ---------------------------------------------------------------------------

export function describeGroupMeta(groupName: string, page: GroupMetaPage, nameOf: (userId: string) => string): string {
    if (!page.game) return `Aucun résultat de tournoi des membres de « ${groupName} » : pas de méta à calculer.`;

    const { totals, legends, domains, members } = page.meta;
    const period = page.period
        ? `extension ${page.period.name} (depuis le ${day(page.period.from)}${page.period.to ? `, jusqu'au ${day(page.period.to)}` : ""})`
        : "toute l'histoire";
    const otherGames = page.games.filter((entry) => entry.game.id !== page.game?.id);

    if (totals.participations === 0) {
        return (
            `Méta de « ${groupName} » sur ${page.game.name}, ${period} : aucune participation.` +
            (page.periods.length ? ` Extensions : ${page.periods.map((p) => p.setCode).join(", ")}, ou « tout ».` : "")
        );
    }

    const headline = [
        plural(totals.participations, "participation"),
        plural(totals.tournaments, "tournoi"),
        plural(totals.members, "membre"),
        `${totals.topEights} top 8`,
        totals.rate !== undefined ? `winrate ${rate(totals.rate)} sur ${plural(totals.matches, "match", "matchs")}` : undefined,
    ].filter(Boolean);

    const legendLines = legends.slice(0, 10).map((legend) => {
        const details = [
            `${percent(legend.share)} (${plural(legend.decks, "deck")})`,
            legend.metaShare !== undefined ? `${points(legend.share - legend.metaShare)} vs méta` : undefined,
            legend.rate !== undefined ? `${rate(legend.rate)} de victoires` : undefined,
            legend.topCuts ? `${legend.topCuts} top 8` : undefined,
            legend.userIds.length ? legend.userIds.map(nameOf).join(", ") : undefined,
        ].filter(Boolean);
        return `- ${legend.name} : ${details.join(" · ")}`;
    });
    const domainLines = domains.map(
        (domain) =>
            `- ${domain.domain} : ${percent(domain.share)}${domain.metaShare !== undefined ? ` (${points(domain.share - domain.metaShare)} vs méta)` : ""}`,
    );
    const opponents = page.matchups.opponents.slice(0, 8).map(
        (row) => `- ${row.legend} : ${plural(row.matches, "match", "matchs")}, ${row.rate !== undefined ? `${rate(row.rate)} de victoires` : "trop peu de matchs pour un winrate"}`,
    );
    // Les membres portent les clés des légendes (celles des filtres) : leur nom vient de la liste des légendes.
    const legendName = new Map(legends.map((legend) => [legend.key, legend.name]));
    const memberLines = members.map((row) => {
        const details = [
            plural(row.tournaments, "tournoi"),
            row.best ? `meilleur : ${placementLabel(row.best)}` : undefined,
            row.rate !== undefined ? rate(row.rate) : undefined,
            row.legends.length ? row.legends.slice(0, 3).map((key) => legendName.get(key) ?? key).join(", ") : undefined,
        ].filter(Boolean);
        return `- ${nameOf(row.userId)} : ${details.join(" · ")}`;
    });

    return [
        `Méta de « ${groupName} » sur ${page.game.name}, ${period}${page.compared ? ", comparée à la méta du jeu" : ""}.`,
        headline.join(" · ") + ".",
        `Légendes :\n${legendLines.join("\n")}`,
        domainLines.length ? `Domaines :\n${domainLines.join("\n")}` : "",
        opponents.length
            ? `Contre les légendes adverses (${plural(page.matchups.counted, "match", "matchs")} comptés, hors miroirs et matchs entre membres ; winrate dès 10 matchs) :\n${opponents.join("\n")}`
            : "",
        `Membres :\n${memberLines.join("\n")}`,
        page.periods.length ? `Autres périodes : ${page.periods.map((p) => p.setCode).join(", ")}, ou « tout ».` : "",
        otherGames.length ? `Autres jeux : ${otherGames.map((entry) => entry.game.name).join(", ")}.` : "",
    ]
        .filter(Boolean)
        .join("\n\n");
}
