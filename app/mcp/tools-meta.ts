import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { getDeckById } from "@/lib/db/decks";
import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { getGameBySlugOrId } from "@/lib/db/games";
import { importMetaDecks } from "@/lib/db/meta-decks";
import { loadMetaEventsMatches } from "@/lib/db/meta-events";
import { anyUserHasPermission } from "@/lib/db/permissions";
import { getDeckZones } from "@/lib/decks/zones";
import { metaCacheTag } from "@/lib/meta/cache";
import { MetaImportTooLargeError, resolveMetaImport, type MetaImportRow } from "@/lib/meta/import";
import { knownGameSets, loadMetaSample } from "@/lib/meta/load";
import {
    domainWinrates,
    eventsBetween,
    legendMatchups,
    legendWinrates,
    matchTotals,
    topCutPlayers,
} from "@/lib/meta/match-stats";
import { META_DECKS_PERMISSION } from "@/lib/meta/permissions";
import { resolveMetaSettings, type ResolvedMetaSettings } from "@/lib/meta/settings";
import {
    computeAssociations,
    computeCardStats,
    computeOverview,
    computeStapleGroups,
    computeTrends,
    filterMetaDecks,
    legendLabel,
    type MetaFilters,
    type MetaSample,
} from "@/lib/meta/stats";
import {
    byPlacement,
    computeTournamentStats,
    findTournamentDecks,
    findTournamentMatches,
    listTournaments,
    tournamentDate,
    tournamentSlug,
} from "@/lib/meta/tournaments";
import { thresholdPercent } from "@/lib/meta/page-params";
import {
    describeAssociations,
    describeCardStats,
    describeDomainWinrates,
    describeLegendMatchups,
    describeLegendWinrates,
    describeMatchup,
    describeOverview,
    describeScope,
    describeStapleGroups,
    describeTotals,
    day,
    describeTournament,
    describeTournamentLine,
    findTournaments,
    normalizeName,
    pickByName,
    plural,
    resolveWinratePeriod,
    sampleDomains,
    sampleLegends,
    type NameMatch,
} from "@/lib/mcp/meta";
import { linkLine, mcpLinks } from "@/lib/mcp/links";
import { validateDeckList, type DeckList, type DeckListCard } from "@/app/[locale]/(app)/games/riftbound/deck-checker/action";
import { serializeDeckList } from "@/app/[locale]/(app)/games/riftbound/deck-checker/utils";
import { DECK_CHECK_VIEW_URI, type DeckCheckResult } from "@/mcp-apps/deck-check/result";
import { registerJoutesTool, userIdFrom, type ToolResult } from "./tool-policy";
import { deckForView, errorResult, formatDeckSection, resolveGame, textResult, withToolLogging } from "./tools";

/*
 * Les outils de la méta des decks : ce que montre la page Méta d'un jeu
 * (/games/[jeu]/meta), calculé par les mêmes fonctions, pour qu'un assistant
 * réponde « quelles légendes dominent ? », « quel winrate pour Jinx contre
 * Kennen ? » ou « qu'a joué le top 8 de la RC Europe ? ».
 *
 * Lecture publique, comme la page. Seul l'import écrit, avec la permission
 * de la gestion de la méta.
 */

type MetaGame = {
    gameId: string;
    name: string;
    slug: string;
    settings: ResolvedMetaSettings;
};

/** Le jeu, s'il a la méta ouverte ; Riftbound par défaut. */
async function resolveMetaGame(gameName?: string): Promise<MetaGame | { error: ToolResult }> {
    const wanted = gameName?.trim() || "riftbound";
    const game = await resolveGame(wanted);
    if (!game) return { error: errorResult(`Jeu « ${wanted} » introuvable.`) };
    if (!game.features?.meta) return { error: errorResult(`La méta des decks n'est pas ouverte pour ${game.name}.`) };
    const gameId = game._id.toString();
    return { gameId, name: game.name, slug: game.slug ?? gameId, settings: resolveMetaSettings(game.metaSettings) };
}

/** Ce qu'on cherche, pour les messages : « Aucune légende », « Plusieurs légendes ». */
type Searched = { none: string; several: string };
const SEARCHED = {
    tournament: { none: "Aucun tournoi", several: "Plusieurs tournois" },
    legend: { none: "Aucune légende", several: "Plusieurs légendes" },
    domain: { none: "Aucun domaine", several: "Plusieurs domaines" },
    card: { none: "Aucune carte", several: "Plusieurs cartes" },
} satisfies Record<string, Searched>;

/** Le refus d'une recherche par nom : rien trouvé, ou plusieurs candidats à départager. */
function nameError<T>(match: NameMatch<T>, what: Searched, query: string, label: (item: T) => string, all: T[]): ToolResult | null {
    if ("found" in match) return null;
    if ("ambiguous" in match) {
        return errorResult(`${what.several} répondent à « ${query} » : ${match.ambiguous.slice(0, 12).map(label).join(", ")}. Préciser le nom.`);
    }
    const known = all.slice(0, 20).map(label).join(", ");
    return errorResult(`${what.none} « ${query} » dans la méta.${known ? ` Exemples : ${known}.` : ""}`);
}

const filterShape = {
    gameName: z.string().optional().describe("Nom ou slug du jeu (défaut : riftbound)"),
    periodDays: z.number().int().min(0).max(3650).optional()
        .describe("Période en jours jusqu'à aujourd'hui ; 0 = tout l'historique. Défaut : la période réglée pour le jeu (souvent 30)."),
    tournament: z.string().optional().describe("Ne garder que les decks d'un tournoi (nom, ex. « RC Europe »)"),
    legend: z.string().optional().describe("Ne garder que les decks d'une légende (nom, ex. « Jinx »)"),
    domain: z.string().optional().describe("Ne garder que les decks qui jouent ce domaine (nom anglais du catalogue : Fury, Calm, Mind, Body, Chaos, Order)"),
};

type FilterArgs = { gameName?: string; periodDays?: number; tournament?: string; legend?: string; domain?: string };

type MetaContext = MetaGame & {
    sample: MetaSample;
    filters: MetaFilters;
    /** Les noms lisibles des filtres. */
    labels: { source?: string; legend?: string; domain?: string };
    /** Les paramètres de la page Méta pour la même vue. */
    query: Record<string, string | undefined>;
    now: Date;
};

/** Le jeu, l'échantillon et les filtres résolus ; une erreur lisible sinon. */
async function loadMetaContext(args: FilterArgs): Promise<MetaContext | { error: ToolResult }> {
    const game = await resolveMetaGame(args.gameName);
    if ("error" in game) return game;
    const sample = await loadMetaSample(game.gameId, game.slug);
    if (sample.decks.length === 0) {
        return { error: textResult(`Aucun deck méta n'est encore relevé pour ${game.name}.`) };
    }

    const periodDays = args.periodDays ?? game.settings.defaultPeriodDays;
    const filters: MetaFilters = { periodDays };
    const labels: MetaContext["labels"] = {};

    if (args.tournament) {
        const sources = [...new Set(sample.decks.map((deck) => deck.source))];
        const match = pickByName(sources, (source) => source, args.tournament);
        const error = nameError(match, SEARCHED.tournament, args.tournament, (source) => source, sources);
        if (error || !("found" in match)) return { error: error! };
        filters.source = labels.source = match.found;
    }
    if (args.legend) {
        const legends = sampleLegends(sample.decks, sample.cards);
        const match = pickByName(legends, (legend) => legend.name, args.legend);
        const error = nameError(match, SEARCHED.legend, args.legend, (legend) => legend.name, legends);
        if (error || !("found" in match)) return { error: error! };
        filters.legend = match.found.key;
        labels.legend = match.found.name;
    }
    if (args.domain) {
        const domains = sampleDomains(sample.decks);
        const match = pickByName(domains, (domain) => domain, args.domain);
        const error = nameError(match, SEARCHED.domain, args.domain, (domain) => domain, domains);
        if (error || !("found" in match)) return { error: error! };
        filters.domain = labels.domain = match.found;
    }

    return {
        ...game,
        sample,
        filters,
        labels,
        query: {
            period: periodDays !== game.settings.defaultPeriodDays ? String(periodDays) : undefined,
            source: filters.source,
            legend: filters.legend,
            domain: filters.domain,
        },
        now: new Date(),
    };
}

function scopeLine(context: MetaContext, decks: number): string {
    return describeScope({ gameName: context.name, decks, periodDays: context.filters.periodDays, ...context.labels });
}

const NO_DECK = "Aucun deck ne correspond à ces filtres. Élargir la période (periodDays: 0 pour tout l'historique) ou retirer un filtre.";

// --- Lecture ---

async function handleGetMetaOverview(args: FilterArgs): Promise<ToolResult> {
    const context = await loadMetaContext(args);
    if ("error" in context) return context.error;
    const { sample, filters, now } = context;

    const decks = filterMetaDecks(sample.decks, filters, now);
    if (decks.length === 0) return textResult(`${scopeLine(context, 0)}\n\n${NO_DECK}`);
    const stats = computeCardStats(decks, sample.cards);
    const overview = computeOverview(decks, sample.cards, stats);
    // La tendance a sa propre fenêtre : la période choisie ne s'y applique pas, comme sur la page.
    const trends = computeTrends(filterMetaDecks(sample.decks, { ...filters, periodDays: 0 }, now), sample.cards, now);
    const latest = sample.decks.reduce((max, deck) => (deck.eventDate > max ? deck.eventDate : max), "");

    return textResult(
        `${scopeLine(context, decks.length)} Dernier tournoi relevé : ${day(latest)}.\n\n` +
        describeOverview(overview, trends) +
        linkLine(mcpLinks.meta(context.slug, context.query)),
    );
}

async function handleGetMetaCards(
    args: FilterArgs & { card?: string; cardType?: string; limit: number; offset: number },
): Promise<ToolResult> {
    const context = await loadMetaContext(args);
    if ("error" in context) return context.error;
    const { sample, filters, now } = context;

    const decks = filterMetaDecks(sample.decks, filters, now);
    if (decks.length === 0) return textResult(`${scopeLine(context, 0)}\n\n${NO_DECK}`);
    const stats = computeCardStats(decks, sample.cards);

    if (args.card) {
        const match = pickByName(stats, (stat) => stat.name, args.card);
        const error = nameError(match, SEARCHED.card, args.card, (stat) => stat.name, stats);
        if (error || !("found" in match)) {
            return "none" in match
                ? textResult(`${scopeLine(context, decks.length)}\n\n« ${args.card} » n'est jouée dans aucun de ces decks.`)
                : error!;
        }
        const associations = computeAssociations(decks, sample.cards, stats, match.found.name);
        if (!associations) return textResult(`${scopeLine(context, decks.length)}\n\n« ${match.found.name} » n'est jouée dans aucun de ces decks.`);
        return textResult(
            `${scopeLine(context, decks.length)}\n\n${describeAssociations(associations)}` +
            linkLine(mcpLinks.meta(context.slug, { ...context.query, tab: "together", card: match.found.name })),
        );
    }

    let shown = stats;
    if (args.cardType) {
        const wanted = normalizeName(args.cardType);
        shown = stats.filter((stat) => stat.type && normalizeName(stat.type) === wanted);
        if (shown.length === 0) {
            const types = [...new Set(stats.map((stat) => stat.type).filter(Boolean))].join(", ");
            return errorResult(`Aucune carte de type « ${args.cardType} » dans ces decks. Types joués : ${types}.`);
        }
    }
    const trends = computeTrends(filterMetaDecks(sample.decks, { ...filters, periodDays: 0 }, now), sample.cards, now);

    return textResult(
        `${scopeLine(context, decks.length)}\n\n` +
        describeCardStats(shown, trends, { limit: args.limit, offset: args.offset }) +
        linkLine(mcpLinks.meta(context.slug, { ...context.query, tab: "cards", type: args.cardType ? shown[0]?.type : undefined })),
    );
}

async function handleGetMetaStaples(args: FilterArgs & { threshold?: number }): Promise<ToolResult> {
    const context = await loadMetaContext(args);
    if ("error" in context) return context.error;
    const { sample, filters, now, settings } = context;

    const decks = filterMetaDecks(sample.decks, filters, now);
    if (decks.length === 0) return textResult(`${scopeLine(context, 0)}\n\n${NO_DECK}`);
    const stats = computeCardStats(decks, sample.cards);
    const stapleSettings = { threshold: args.threshold ?? settings.stapleThreshold, minDecks: settings.minDecksPerDomain };
    const groups = computeStapleGroups(stats, decks, stapleSettings);
    const seuil = thresholdPercent(stapleSettings.threshold);

    return textResult(
        `${scopeLine(context, decks.length)}\n\n${describeStapleGroups(groups, stapleSettings)}` +
        linkLine(mcpLinks.meta(context.slug, {
            ...context.query,
            tab: "staples",
            seuil: seuil !== thresholdPercent(settings.stapleThreshold) ? String(seuil) : undefined,
        })),
    );
}

async function handleGetMetaWinrates(args: {
    gameName?: string;
    setCode?: string;
    from?: string;
    to?: string;
    allTime?: boolean;
    includeTop?: boolean;
    legend?: string;
    opponent?: string;
    limit: number;
}): Promise<ToolResult> {
    const game = await resolveMetaGame(args.gameName);
    if ("error" in game) return game.error;

    const events = await loadMetaEventsMatches(game.gameId);
    if (events.length === 0) {
        return textResult(`Aucun tournoi de ${game.name} n'a encore ses matchs importés : pas de winrates.`);
    }

    const setNames = Object.fromEntries(knownGameSets(game.slug).map((set) => [set.setCode, set.name]));
    const resolved = resolveWinratePeriod({
        releases: game.settings.setReleases,
        setNames,
        today: new Date().toISOString().slice(0, 10),
        setCode: args.setCode,
        from: args.from,
        to: args.to,
        allTime: args.allTime,
    });
    if ("error" in resolved) return errorResult(resolved.error);
    const { period } = resolved;

    const includeTop = args.includeTop ?? false;
    const filter = { includeTop };
    const counted = eventsBetween(events, period.from, period.to);
    const header =
        `Winrates ${game.name}, ${period.label}. ` +
        describeTotals(matchTotals(counted), counted.length, includeTop);
    const link = linkLine(mcpLinks.meta(game.slug, { tab: "winrates", ...period.query, phases: includeTop ? "top" : undefined }));
    if (counted.length === 0) return textResult(`${header}\n\nAucun tournoi avec matchs sur cette période.${link}`);

    const legends = legendWinrates(counted, filter);
    const pickLegend = (query: string) => {
        const match = pickByName(legends, (row) => row.legend, query);
        return { match, error: nameError(match, SEARCHED.legend, query, (row) => row.legend, legends) };
    };

    if (args.legend) {
        const mine = pickLegend(args.legend);
        if (mine.error || !("found" in mine.match)) return mine.error!;
        const legend = mine.match.found;
        const matchups = legendMatchups(counted, filter);

        if (args.opponent) {
            const theirs = pickLegend(args.opponent);
            if (theirs.error || !("found" in theirs.match)) return theirs.error!;
            const opponent = theirs.match.found.legend;
            return textResult(`${header}\n\n${describeMatchup(legend.legend, opponent, matchups.get(legend.legend)?.get(opponent))}${link}`);
        }

        return textResult(
            `${header}\n\n${describeLegendWinrates([legend], 1).split("\n").slice(1).join("\n")}\n\n` +
            `${describeLegendMatchups(legend.legend, matchups.get(legend.legend), args.limit)}${link}`,
        );
    }

    const domains = describeDomainWinrates(domainWinrates(counted, filter));
    return textResult(`${header}\n\n${describeLegendWinrates(legends, args.limit)}${domains ? `\n\n${domains}` : ""}${link}`);
}

async function handleListMetaTournaments(args: { gameName?: string; periodDays?: number; limit: number }): Promise<ToolResult> {
    const game = await resolveMetaGame(args.gameName);
    if ("error" in game) return game.error;
    const [sample, events] = await Promise.all([loadMetaSample(game.gameId, game.slug), loadMetaEventsMatches(game.gameId)]);

    const periodDays = args.periodDays ?? 0;
    const tournaments = listTournaments(filterMetaDecks(sample.decks, { periodDays }, new Date()), sample.cards);
    if (tournaments.length === 0) {
        return textResult(`Aucun tournoi relevé pour ${game.name}${periodDays > 0 ? ` sur les ${periodDays} derniers jours` : ""}.`);
    }

    const shown = tournaments.slice(0, args.limit);
    const lines = shown.map((summary) =>
        `${describeTournamentLine(summary, !!findTournamentMatches(events, summary.date, summary.slug))} · ${mcpLinks.metaTournament(game.slug, summary.date, summary.slug)}`,
    );
    return textResult(
        `${plural(tournaments.length, "tournoi")} relevé${tournaments.length > 1 ? "s" : ""} pour ${game.name}` +
        `${periodDays > 0 ? ` sur les ${periodDays} derniers jours` : ""}, les plus récents d'abord` +
        `${shown.length < tournaments.length ? ` (${plural(shown.length, "affiché")})` : ""} :\n\n${lines.join("\n")}` +
        linkLine(mcpLinks.meta(game.slug, { tab: "tournaments", period: periodDays !== game.settings.defaultPeriodDays ? String(periodDays) : undefined })),
    );
}

async function handleGetMetaTournament(args: {
    gameName?: string;
    tournament: string;
    date?: string;
    includeAllDecks?: boolean;
}): Promise<ToolResult> {
    const game = await resolveMetaGame(args.gameName);
    if ("error" in game) return game.error;
    if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return errorResult("Date attendue au format AAAA-MM-JJ.");
    const [sample, events] = await Promise.all([loadMetaSample(game.gameId, game.slug), loadMetaEventsMatches(game.gameId)]);

    const tournaments = listTournaments(sample.decks, sample.cards);
    const found = findTournaments(tournaments, args.tournament, args.date);
    if (found.length === 0) {
        return errorResult(
            `Aucun tournoi « ${args.tournament} »${args.date ? ` le ${args.date}` : ""}. Derniers tournois : ` +
            tournaments.slice(0, 8).map((summary) => `${summary.source} (${summary.date})`).join(", ") + ".",
        );
    }
    if (found.length > 1) {
        return errorResult(
            `Plusieurs tournois répondent : ${found.slice(0, 10).map((summary) => `${summary.source} (${summary.date})`).join(", ")}. Préciser le nom ou la date.`,
        );
    }

    const summary = found[0];
    const decks = findTournamentDecks(sample.decks, summary.date, summary.slug);
    const stats = computeTournamentStats(decks, sample.cards);
    const event = findTournamentMatches(events, summary.date, summary.slug);
    const deckLink = (deckId: string) => mcpLinks.deck(deckId);

    let text = describeTournament(summary, stats, {
        deckLink,
        cards: sample.cards,
        ...(event ? { matches: { totals: matchTotals([event]), top: topCutPlayers(event, 8), players: event.players.length } } : {}),
    });

    if (event) {
        const rows = legendWinrates([event]);
        if (rows.length > 0) text += `\n\n${describeLegendWinrates(rows, 10).replace("Winrates par légende", "Winrates par légende sur ce tournoi (rondes suisses)")}`;
    }

    if (args.includeAllDecks) {
        const all = decks.slice().sort(byPlacement);
        text += `\n\n**Tous les decks** (${all.length}) :\n` + all
            .map((deck) => `- ${deck.placement ?? "non classé"} · ${legendLabel(deck, sample.cards) ?? deck.name}${deck.pilot ? ` (${deck.pilot})` : ""} — id ${deck.id}`)
            .join("\n");
    }

    return textResult(text + linkLine(mcpLinks.metaTournament(game.slug, summary.date, summary.slug)));
}

/** Les zones d'un deck enregistré, dans les sections du vérificateur Riftbound. */
const RIFTBOUND_SECTIONS: Record<string, keyof DeckList> = {
    legend: "legends",
    champions: "champions",
    maindeck: "maindeck",
    sideboard: "sideboard",
    battlefields: "battlefields",
    runes: "runes",
};

async function handleGetMetaDeck(args: { deckId: string }): Promise<ToolResult> {
    const deck = await getDeckById(args.deckId);
    if (!deck || deck.visibility !== "public" || !deck.meta) {
        return errorResult("Deck méta introuvable. Les identifiants se lisent dans get_meta_tournament.");
    }
    const game = await getGameBySlugOrId(deck.gameId);
    const zones = getDeckZones(game);
    const entries = Object.values(deck.cards ?? {}).flatMap((list) => list ?? []);
    const infos = new Map((await getDeckCardInfos(deck.gameId, [...new Set(entries.map((entry) => entry.cardId))])).map((info) => [info.id, info]));

    const sections: Partial<Record<keyof DeckList, DeckListCard[]>> = {};
    const zoneTexts: string[] = [];
    for (const zone of zones) {
        const cards = (deck.cards?.[zone.key] ?? [])
            .map((entry) => ({ name: infos.get(entry.cardId)?.name ?? entry.cardId, quantity: entry.quantity }));
        if (cards.length === 0) continue;
        zoneTexts.push(formatDeckSection(zone.label, cards));
        const section = RIFTBOUND_SECTIONS[zone.key];
        if (section) sections[section] = [...(sections[section] ?? []), ...cards];
    }

    const meta = deck.meta;
    const metaLine = [
        meta.source,
        tournamentDate(meta.eventDate),
        meta.placement,
        meta.pilot ? `joué par ${meta.pilot}` : deck.creatorName ? `deck de ${deck.creatorName}` : "",
    ].filter(Boolean).join(" · ");
    const url = mcpLinks.deck(deck.id);
    const text =
        `**${deck.name}**\n${metaLine}` +
        (deck.legendName ? `\nLégende : ${deck.legendName}` : "") +
        (deck.domains && deck.domains.length > 0 ? `\nDomaines : ${deck.domains.join(" + ")}` : "") +
        (deck.url ? `\nListe d'origine : ${deck.url}` : "") +
        `\n\n${zoneTexts.join("\n\n")}`;
    const links =
        `\n\nTournoi : ${mcpLinks.metaTournament(game?.slug ?? deck.gameId, tournamentDate(meta.eventDate), tournamentSlug(meta.source))}` +
        linkLine(url);

    // La vue du vérificateur ne sait afficher qu'un deck Riftbound.
    if (game?.slug !== "riftbound") return textResult(text + links);
    const validated = await validateDeckList({
        champions: sections.champions ?? [],
        legends: sections.legends ?? [],
        maindeck: sections.maindeck ?? [],
        sideboard: sections.sideboard ?? [],
        battlefields: sections.battlefields ?? [],
        runes: sections.runes ?? [],
    });
    let code: string | undefined;
    try {
        code = serializeDeckList(validated);
    } catch {
        code = undefined;
    }
    const structuredContent: DeckCheckResult = { deck: deckForView(validated), code, url };
    return { ...textResult(`${text}${code ? `\n\nCode : ${code}` : ""}${links}`), structuredContent };
}

// --- Import ---

function describeImportRow(row: MetaImportRow): string {
    const status = { ready: "prêt", warning: "à vérifier", duplicate: "doublon, ignoré", error: "erreur, ignoré" }[row.status];
    const zones = row.zones.filter((zone) => !zone.compliant).map((zone) => `${zone.label} ${zone.count}`);
    return (
        `- ligne ${row.line} · ${status}` +
        (row.name ? ` — ${row.name}` : ` — ${row.label}`) +
        (row.domains.length > 0 ? ` · ${row.domains.join(" + ")}` : "") +
        (zones.length > 0 ? ` · zones incomplètes : ${zones.join(", ")}` : "") +
        (row.duplicateOf ? ` · doublon de ${"deckId" in row.duplicateOf ? `${row.duplicateOf.name} (${row.duplicateOf.deckId})` : `la ligne ${row.duplicateOf.line}`}` : "") +
        (row.notes.length > 0 ? `\n  ${row.notes.join(" ; ")}` : "")
    );
}

async function handleImportMetaDecks(
    args: { gameName?: string; input: string; source: string; eventDate: string; format?: string; dryRun: boolean; expected?: number },
    extra: ServerContext,
): Promise<ToolResult> {
    const userId = userIdFrom(extra)!;
    if (!(await anyUserHasPermission([userId], META_DECKS_PERMISSION))) {
        return errorResult("Réservé aux gestionnaires de la méta (permission metaDecks:manage).");
    }
    const metaGame = await resolveMetaGame(args.gameName);
    if ("error" in metaGame) return metaGame.error;
    const game = await getGameBySlugOrId(metaGame.gameId);
    if (!game) return errorResult("Jeu introuvable.");

    const eventDate = new Date(/^\d{4}-\d{2}-\d{2}$/.test(args.eventDate) ? `${args.eventDate}T00:00:00Z` : args.eventDate);
    if (Number.isNaN(eventDate.getTime())) return errorResult("eventDate attendue au format AAAA-MM-JJ.");
    const source = args.source.trim();
    if (!source) return errorResult("Indiquer la source (le tournoi).");

    try {
        if (args.dryRun) {
            const rows = await resolveMetaImport(game, args.input, { source });
            const importable = rows.filter((row) => row.status === "ready" || row.status === "warning").length;
            return textResult(
                `Vérification, rien n'est écrit : ${plural(rows.length, "deck")} lu${rows.length > 1 ? "s" : ""}, ${importable} importable${importable > 1 ? "s" : ""}.\n\n` +
                rows.map(describeImportRow).join("\n") +
                (importable > 0 ? `\n\nPour importer, rappeler l'outil avec dryRun: false et expected: ${importable}.` : ""),
            );
        }

        const result = await importMetaDecks(
            { game, input: args.input, source, eventDate, format: args.format?.trim() || undefined, expected: args.expected },
            userId,
        );
        if (!result.ok) {
            return errorResult(
                "Le collage ne donne plus le nombre de decks attendu (un deck a pu changer). Rien n'a été importé : relancer la vérification (dryRun: true).\n\n" +
                result.rows.map(describeImportRow).join("\n"),
            );
        }

        revalidateTag(metaCacheTag(metaGame.gameId), { expire: 0 });
        revalidatePath("/decks/library");
        revalidatePath("/decks/meta/manage");

        const skipped = result.rows.length - result.created.length;
        return textResult(
            `${plural(result.created.length, "deck importé", "decks importés")} pour « ${source} » (lot ${result.batchId})` +
            (skipped > 0 ? `, ${skipped} laissé${skipped > 1 ? "s" : ""} de côté (doublons ou erreurs)` : "") +
            ".\n\n" +
            result.created.map((deck) => `- ${deck.name} — ${mcpLinks.deck(deck.deckId)}`).join("\n") +
            linkLine(mcpLinks.metaTournament(metaGame.slug, tournamentDate(eventDate), tournamentSlug(source))),
        );
    } catch (error) {
        if (error instanceof MetaImportTooLargeError) return errorResult(error.message);
        throw error;
    }
}

export function registerMetaTools(server: McpServer) {
    registerJoutesTool(server, "get_meta_overview", {
        title: "Get deck meta overview",
        description:
            "Méta des decks de tournoi d'un jeu (Riftbound par défaut), comme la page Méta de Joutes : nombre de decks, légendes les plus jouées " +
            "(part et top 8), domaines et paire de domaines dominante, cartes en hausse ou en baisse sur 30 jours. Filtrable par période, tournoi, légende, domaine.",
        inputSchema: filterShape,
    }, withToolLogging("get_meta_overview", handleGetMetaOverview));

    registerJoutesTool(server, "get_meta_cards", {
        title: "Get most played meta cards",
        description:
            "Cartes les plus jouées dans la méta : nombre et part des decks, part des decks de son domaine, exemplaires moyens, tendance. " +
            "Avec card : les cartes souvent (ou rarement) jouées avec elle et les légendes qui la jouent. Mêmes filtres que get_meta_overview.",
        inputSchema: {
            ...filterShape,
            card: z.string().optional().describe("Étudier une carte : ce qui se joue avec elle"),
            cardType: z.string().optional().describe("Ne lister que ce type de carte (nom du catalogue : Unit, Spell, Gear…)"),
            limit: z.number().int().min(1).max(100).default(25),
            offset: z.number().int().min(0).default(0),
        },
    }, withToolLogging("get_meta_cards", handleGetMetaCards));

    registerJoutesTool(server, "get_meta_staples", {
        title: "Get meta staples",
        description:
            "Staples de la méta, par domaine (et paires de domaines, et incolores) : les cartes jouées par la grande majorité des decks qui jouent leur domaine. " +
            "Seuil réglé pour le jeu par défaut, modifiable. Mêmes filtres que get_meta_overview.",
        inputSchema: {
            ...filterShape,
            threshold: z.number().min(0.05).max(1).optional().describe("Seuil d'une staple, de 0 à 1 (ex. 0.75 = 75 % des decks du domaine)"),
        },
    }, withToolLogging("get_meta_staples", handleGetMetaStaples));

    registerJoutesTool(server, "get_meta_winrates", {
        title: "Get meta winrates",
        description:
            "Winrates tirés des matchs des tournois importés : par légende et par domaine, sur l'extension en cours par défaut. " +
            "Avec legend : son bilan contre chaque légende ; avec legend et opponent : ce matchup précis. " +
            "Période : setCode (une extension), from/to (dates), ou allTime. Rondes suisses seulement, sauf includeTop.",
        inputSchema: {
            gameName: z.string().optional().describe("Nom ou slug du jeu (défaut : riftbound)"),
            setCode: z.string().optional().describe("Extension (code ou nom), de sa sortie à la suivante"),
            from: z.string().optional().describe("Premier jour, AAAA-MM-JJ"),
            to: z.string().optional().describe("Dernier jour, AAAA-MM-JJ"),
            allTime: z.boolean().optional().describe("Tout l'historique plutôt que l'extension en cours"),
            includeTop: z.boolean().optional().describe("Compter aussi les matchs du top (élimination directe)"),
            legend: z.string().optional().describe("Légende étudiée (nom, ex. « Jinx »)"),
            opponent: z.string().optional().describe("Légende adverse, avec legend"),
            limit: z.number().int().min(1).max(60).default(20),
        },
    }, withToolLogging("get_meta_winrates", handleGetMetaWinrates));

    registerJoutesTool(server, "list_meta_tournaments", {
        title: "List meta tournaments",
        description:
            "Tournois dont les decks sont relevés dans la méta, les plus récents d'abord : date, nombre de decks, vainqueur, légende la plus jouée, " +
            "et si leurs matchs sont importés. Tout l'historique par défaut.",
        inputSchema: {
            gameName: z.string().optional().describe("Nom ou slug du jeu (défaut : riftbound)"),
            periodDays: z.number().int().min(0).max(3650).optional().describe("Seulement les N derniers jours ; 0 ou absent = tout"),
            limit: z.number().int().min(1).max(100).default(30),
        },
    }, withToolLogging("list_meta_tournaments", handleListMetaTournaments));

    registerJoutesTool(server, "get_meta_tournament", {
        title: "Get meta tournament",
        description:
            "Un tournoi de la méta : top 8 (avec l'id de chaque deck, à ouvrir avec get_meta_deck), légendes et leur conversion en top 8, " +
            "combinaisons de domaines, cartes qui distinguent le top 8, et, si ses matchs sont importés, classement final et winrates du tournoi.",
        inputSchema: {
            gameName: z.string().optional().describe("Nom ou slug du jeu (défaut : riftbound)"),
            tournament: z.string().describe("Nom du tournoi (ex. « RC Europe »), tel que list_meta_tournaments l'écrit"),
            date: z.string().optional().describe("Jour du tournoi, AAAA-MM-JJ, si plusieurs portent ce nom"),
            includeAllDecks: z.boolean().optional().describe("Lister tous les decks du tournoi avec leur id, pas seulement le top 8"),
        },
    }, withToolLogging("get_meta_tournament", handleGetMetaTournament));

    registerJoutesTool(server, "get_meta_deck", {
        title: "Get meta deck",
        view: DECK_CHECK_VIEW_URI,
        description:
            "La liste complète d'un deck de la méta (par zone), avec sa provenance : tournoi, date, classement, joueur. " +
            "Pour Riftbound, le deck s'affiche aussi comme dans le vérificateur, erratas compris.",
        inputSchema: {
            deckId: z.string().describe("Id du deck, lu dans get_meta_tournament"),
        },
    }, withToolLogging("get_meta_deck", handleGetMetaDeck));

    registerJoutesTool(server, "import_meta_decks", {
        title: "Import meta decks",
        description:
            "Gestion de la méta : importer des decks de tournoi en decks publics comptés dans les statistiques. input : un deck par bloc " +
            "(lien ou code Piltover Archive, ou liste texte), comme l'écran d'import. Par défaut (dryRun: true), vérifie sans rien écrire ; " +
            "puis rappeler avec dryRun: false et expected (le nombre d'importables annoncé). Réservé aux gestionnaires de la méta.",
        inputSchema: {
            gameName: z.string().optional().describe("Nom ou slug du jeu (défaut : riftbound)"),
            input: z.string().min(1).max(200_000).describe("Les decks collés : liens, codes ou listes, un classement après « #1 » si connu"),
            source: z.string().min(1).max(80).describe("Le tournoi (ex. « Regional Lyon »)"),
            eventDate: z.string().describe("Date du tournoi, AAAA-MM-JJ"),
            format: z.string().max(80).optional(),
            dryRun: z.boolean().default(true),
            expected: z.number().int().min(0).optional().describe("Nombre de decks importables annoncé par la vérification"),
        },
    }, withToolLogging("import_meta_decks", handleImportMetaDecks));
}
