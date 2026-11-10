/**
 * Les textes des outils MCP de la méta des decks, en fonctions pures.
 *
 * Les chiffres viennent des mêmes calculs que la page Méta d'un jeu
 * (`lib/meta/stats.ts`, `match-stats.ts`, `tournaments.ts`) : l'assistant doit
 * dire exactement ce que la page affiche. Ici, on ne fait que choisir, ranger
 * et écrire.
 */

import {
    COLORLESS,
    legendKey,
    legendLabel,
    type CardAssociations,
    type MetaCard,
    type MetaCardStat,
    type MetaOverview,
    type MetaSampleDeck,
    type StapleGroup,
    type StapleSettings,
} from "@/lib/meta/stats";
import {
    MIN_MATCHES_FOR_RATE,
    recordMatches,
    winrate,
    type DomainWinrate,
    type LegendWinrate,
    type MatchRecord,
    type MatchTotals,
    type MetaEventPlayer,
} from "@/lib/meta/match-stats";
import { currentSetPeriod, setPeriods, type SetPeriod } from "@/lib/meta/set-periods";
import type { TournamentStats, TournamentSummary } from "@/lib/meta/tournaments";

const percentFormat = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const rateFormat = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimalFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Une part, arrondie à l'unité : « 42 % ». */
export function percent(value: number): string {
    return percentFormat.format(value);
}

/** Un winrate, au dixième : « 54,3 % ». */
export function rate(value: number): string {
    return rateFormat.format(value);
}

/** Un écart de part en points : « +9 pts », « −4 pts ». */
export function points(delta: number): string {
    const value = Math.round(delta * 100);
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)} pts`;
}

/** Un jour ISO lisible : « 9 nov. 2026 ». */
export function day(iso: string): string {
    const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Un nom comparable : sans casse, sans accents, sans espaces superflus. */
export function normalizeName(value: string): string {
    return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Les éléments dont le nom répond à une recherche : le nom exact d'abord, puis
 * le début du nom, puis n'importe quelle partie. On s'arrête au premier palier
 * qui trouve : « Jinx » désigne Jinx, pas toutes les cartes qui la citent.
 */
export function matchByName<T>(items: T[], name: (item: T) => string, query: string): T[] {
    const wanted = normalizeName(query);
    if (!wanted) return [];
    const named = items.map((item) => ({ item, key: normalizeName(name(item)) }));
    for (const test of [
        (key: string) => key === wanted,
        (key: string) => key.startsWith(wanted),
        (key: string) => key.includes(wanted),
    ]) {
        const found = named.filter(({ key }) => test(key)).map(({ item }) => item);
        if (found.length > 0) return found;
    }
    return [];
}

export type NameMatch<T> = { found: T } | { none: true } | { ambiguous: T[] };

/** Un seul élément pour une recherche, ou la liste des candidats. */
export function pickByName<T>(items: T[], name: (item: T) => string, query: string): NameMatch<T> {
    const found = matchByName(items, name, query);
    if (found.length === 0) return { none: true };
    if (found.length === 1) return { found: found[0] };
    // Plusieurs fiches du même nom (deux impressions) sont une seule réponse.
    const names = new Set(found.map((item) => normalizeName(name(item))));
    return names.size === 1 ? { found: found[0] } : { ambiguous: found };
}

/** Les légendes de l'échantillon : leur clé (celle du filtre de la page) et leur nom. */
export function sampleLegends(decks: MetaSampleDeck[], cards: Record<string, MetaCard>): { key: string; name: string }[] {
    const legends = new Map<string, string>();
    for (const deck of decks) {
        const key = legendKey(deck);
        if (key && !legends.has(key)) legends.set(key, legendLabel(deck, cards) ?? key);
    }
    return [...legends.entries()].map(([key, name]) => ({ key, name }));
}

/** Les domaines de l'échantillon, dans l'écriture du catalogue (« Fury », « Chaos »…). */
export function sampleDomains(decks: MetaSampleDeck[]): string[] {
    return [...new Set(decks.flatMap((deck) => deck.domains))].sort((a, b) => a.localeCompare(b));
}

/** « 3 decks », « 1 deck ». */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** Ce sur quoi portent les chiffres : la période et les filtres, en une ligne. */
export function describeScope(scope: {
    gameName: string;
    decks: number;
    periodDays: number;
    source?: string;
    legend?: string;
    domain?: string;
}): string {
    const period = scope.periodDays > 0 ? `${scope.periodDays} derniers jours` : "tout l'historique";
    const filters = [
        scope.source ? `tournoi « ${scope.source} »` : "",
        scope.legend ? `légende ${scope.legend}` : "",
        scope.domain ? `domaine ${scope.domain}` : "",
    ].filter(Boolean);
    return (
        `Méta ${scope.gameName} — ${plural(scope.decks, "deck")} de tournoi, ${period}` +
        (filters.length > 0 ? ` (${filters.join(", ")})` : "") +
        "."
    );
}

/** Les cartes qui montent et qui descendent sur 30 jours. */
export function trendMovers(trends: Map<string, number> | null, limit = 5): { up: [string, number][]; down: [string, number][] } {
    if (!trends) return { up: [], down: [] };
    const entries = [...trends.entries()];
    return {
        up: entries.filter(([, delta]) => delta >= 0.05).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit),
        down: entries.filter(([, delta]) => delta <= -0.05).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, limit),
    };
}

function domainsLabel(domains: string[]): string {
    return domains.length > 0 ? domains.join(" + ") : COLORLESS;
}

export function describeOverview(
    overview: MetaOverview,
    trends: Map<string, number> | null,
    options: { legends?: number } = {},
): string {
    const legendLimit = options.legends ?? 12;
    const lines: string[] = [];
    lines.push(
        `${plural(overview.decks, "deck")}, ${plural(overview.sources, "tournoi")}, ${plural(overview.cardsPlayed, "carte différente", "cartes différentes")} jouées.`,
    );

    if (overview.legends.length > 0) {
        lines.push("", `**Légendes les plus jouées** (les 8 premières font ${percent(overview.topLegendsShare)} des decks) :`);
        for (const legend of overview.legends.slice(0, legendLimit)) {
            lines.push(
                `- ${legend.name} — ${plural(legend.decks, "deck")} (${percent(legend.share)})` +
                (legend.topCuts > 0 ? `, ${legend.topCuts} en top 8` : "") +
                (legend.domains.length > 0 ? ` · ${legend.domains.join(" + ")}` : ""),
            );
        }
        if (overview.legends.length > legendLimit) lines.push(`- … et ${overview.legends.length - legendLimit} autres`);
    }

    if (overview.domains.length > 0) {
        lines.push("", "**Domaines** (part des decks qui les jouent) :");
        lines.push(overview.domains.map((domain) => `${domain.domain} ${percent(domain.share)}`).join(" · "));
        if (overview.topPair) {
            lines.push(
                `Paire la plus jouée : ${overview.topPair.domains.join(" + ")} (${plural(overview.topPair.decks, "deck")}, ${percent(overview.topPair.share)}).`,
            );
        }
    }

    const movers = trendMovers(trends);
    if (movers.up.length > 0 || movers.down.length > 0) {
        lines.push("", "**Tendance** (part des decks sur 30 jours, comparée aux 30 jours d'avant) :");
        if (movers.up.length > 0) lines.push(`En hausse : ${movers.up.map(([name, delta]) => `${name} ${points(delta)}`).join(", ")}.`);
        if (movers.down.length > 0) lines.push(`En baisse : ${movers.down.map(([name, delta]) => `${name} ${points(delta)}`).join(", ")}.`);
    }

    return lines.join("\n");
}

/** Une ligne du tableau des cartes. */
export function describeCardStat(stat: MetaCardStat, trend?: number): string {
    return (
        `- ${stat.name}${stat.type ? ` (${stat.type})` : ""} — ${plural(stat.decks, "deck")} (${percent(stat.share)})` +
        (stat.domains.length > 0
            ? `, ${percent(stat.domainShare)} des decks ${stat.domains.join(" + ")}`
            : ", incolore") +
        `, ${decimalFormat.format(stat.averageCopies)} ex. en moyenne` +
        (trend !== undefined && Math.abs(trend) >= 0.01 ? `, tendance ${points(trend)}` : "")
    );
}

export function describeCardStats(
    stats: MetaCardStat[],
    trends: Map<string, number> | null,
    options: { limit: number; offset?: number },
): string {
    const offset = options.offset ?? 0;
    const shown = stats.slice(offset, offset + options.limit);
    if (shown.length === 0) return "Aucune carte jouée dans cet échantillon.";
    const lines = [
        `**Cartes les plus jouées** (${offset + 1}–${offset + shown.length} sur ${stats.length}) :`,
        ...shown.map((stat) => describeCardStat(stat, trends?.get(stat.name))),
    ];
    if (offset + shown.length < stats.length) {
        lines.push(`… ${stats.length - offset - shown.length} autres : relancer avec offset ${offset + shown.length}.`);
    }
    return lines.join("\n");
}

export function describeAssociations(associations: CardAssociations): string {
    const { card } = associations;
    const lines = [`**${card.name}** — ${describeCardStat(card).split(" — ").slice(1).join(" — ")}`];
    if (associations.legends.length > 0) {
        lines.push(`Légendes qui la jouent : ${associations.legends.map((legend) => `${legend.name} (${percent(legend.share)})`).join(", ")}.`);
    }
    if (associations.often.length > 0) {
        lines.push("", "**Souvent jouées avec** (part des decks qui la jouent, et écart au taux habituel) :");
        for (const item of associations.often) {
            lines.push(`- ${item.name} — ${percent(item.withShare)} (habituellement ${percent(item.baseShare)}, ×${decimalFormat.format(item.lift)})`);
        }
    } else {
        lines.push("", "Aucune carte ne lui est nettement associée.");
    }
    if (associations.rarely.length > 0) {
        lines.push("", "**Rarement jouées avec** :");
        for (const item of associations.rarely) {
            lines.push(`- ${item.name} — ${percent(item.withShare)} (habituellement ${percent(item.baseShare)})`);
        }
    }
    return lines.join("\n");
}

export function describeStapleGroups(groups: StapleGroup[], settings: StapleSettings): string {
    if (groups.length === 0) return "Aucun domaine joué dans cet échantillon.";
    const lines = [
        `Staple : carte jouée par au moins ${percent(settings.threshold)} des decks de son ou ses domaines (incolore : de tous les decks), ` +
        `sur ${settings.minDecks} decks au moins.`,
    ];
    for (const group of groups) {
        lines.push("", `**${group.key}** — ${plural(group.decks, "deck")}`);
        if (group.tooFew) {
            lines.push(`Trop peu de decks pour conclure (moins de ${settings.minDecks}).`);
            continue;
        }
        if (group.staples.length === 0) lines.push("Aucune staple.");
        for (const stat of group.staples) {
            lines.push(`- ${stat.name} — ${percent(stat.domainShare)}, ${decimalFormat.format(stat.averageCopies)} ex. en moyenne`);
        }
        if (group.nearMisses.length > 0) {
            lines.push(`Juste sous le seuil : ${group.nearMisses.map((stat) => `${stat.name} (${percent(stat.domainShare)})`).join(", ")}.`);
        }
    }
    return lines.join("\n");
}

// --- Winrates ---

export type WinratePeriod = {
    from?: string;
    to?: string;
    /** « Extension Origins (depuis le 31 oct. 2025) », « tout l'historique »… */
    label: string;
    /** Pour la page : `wr`, `ext`, `du`, `au`. */
    query: Record<string, string>;
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La période des winrates, comme l'onglet de la page : l'extension en cours
 * par défaut (si les sorties sont datées), une extension donnée, deux dates,
 * ou tout l'historique.
 */
export function resolveWinratePeriod(input: {
    releases: Record<string, string>;
    setNames: Record<string, string>;
    today: string;
    setCode?: string;
    from?: string;
    to?: string;
    allTime?: boolean;
}): { period: WinratePeriod } | { error: string } {
    const periods = setPeriods(input.releases, input.setNames);
    const periodLabel = (period: SetPeriod) =>
        `extension ${period.name} (${period.to ? `du ${day(period.from)} au ${day(period.to)}` : `depuis le ${day(period.from)}`})`;

    if (input.from || input.to) {
        if ((input.from && !DAY_PATTERN.test(input.from)) || (input.to && !DAY_PATTERN.test(input.to))) {
            return { error: "Dates attendues au format AAAA-MM-JJ." };
        }
        const label =
            input.from && input.to
                ? `du ${day(input.from)} au ${day(input.to)}`
                : input.from
                    ? `depuis le ${day(input.from)}`
                    : `jusqu'au ${day(input.to!)}`;
        return {
            period: {
                ...(input.from ? { from: input.from } : {}),
                ...(input.to ? { to: input.to } : {}),
                label,
                query: { wr: "dates", ...(input.from ? { du: input.from } : {}), ...(input.to ? { au: input.to } : {}) },
            },
        };
    }

    if (input.setCode) {
        const period = periods.find((candidate) => normalizeName(candidate.setCode) === normalizeName(input.setCode!))
            ?? pickOne(matchByName(periods, (candidate) => candidate.name, input.setCode));
        if (!period) {
            return {
                error: periods.length > 0
                    ? `Extension « ${input.setCode} » sans date de sortie réglée. Extensions datées : ${periods.map((candidate) => `${candidate.name} (${candidate.setCode})`).join(", ")}.`
                    : "Aucune date de sortie d'extension n'est réglée pour ce jeu : utiliser from/to ou allTime.",
            };
        }
        return {
            period: { from: period.from, ...(period.to ? { to: period.to } : {}), label: periodLabel(period), query: { ext: period.setCode } },
        };
    }

    const current = input.allTime ? undefined : currentSetPeriod(periods, input.today);
    if (current) {
        return { period: { from: current.from, ...(current.to ? { to: current.to } : {}), label: periodLabel(current), query: { ext: current.setCode } } };
    }
    return { period: { label: "tout l'historique", query: periods.length > 0 ? { wr: "all" } : {} } };
}

function pickOne<T>(items: T[]): T | undefined {
    return items.length === 1 ? items[0] : undefined;
}

function recordText(record: MatchRecord): string {
    return `${record.wins}-${record.losses}-${record.draws}`;
}

/** Un winrate, signalé quand il repose sur trop peu de matchs. */
function rateText(record: MatchRecord): string {
    const value = winrate(record);
    if (value === undefined) return "aucun match";
    const matches = recordMatches(record);
    return `${rate(value)} sur ${plural(matches, "match", "matchs")} (${recordText(record)})${matches < MIN_MATCHES_FOR_RATE ? ", échantillon faible" : ""}`;
}

export function describeTotals(totals: MatchTotals, events: number, includeTop: boolean): string {
    return (
        `${plural(events, "tournoi")}, ${plural(totals.matches, "match", "matchs")} joués (${plural(totals.draws, "nul")}, byes exclus), ` +
        `${includeTop ? "rondes suisses et top compris" : "rondes suisses seulement"}. Un nul compte pour une demi-victoire, les miroirs sont exclus.`
    );
}

export function describeLegendWinrates(rows: LegendWinrate[], limit: number): string {
    if (rows.length === 0) return "Aucun match avec des légendes connues sur cette période.";
    const shown = rows.slice(0, limit);
    return [
        `**Winrates par légende** (${shown.length} sur ${rows.length}) :`,
        ...shown.map((row) =>
            `- ${row.legend} — ${rateText(row)}, ${plural(row.players, "joueur")}` + (row.top8 > 0 ? `, ${row.top8} en top 8` : ""),
        ),
    ].join("\n");
}

export function describeDomainWinrates(rows: DomainWinrate[]): string {
    if (rows.length === 0) return "";
    return ["**Winrates par domaine** :", ...rows.map((row) => `- ${row.domain} — ${rateText(row)}`)].join("\n");
}

/** Le bilan d'une légende contre chacune des autres, les plus rencontrées d'abord. */
export function describeLegendMatchups(legend: string, line: Map<string, MatchRecord> | undefined, limit: number): string {
    const rows = [...(line ?? new Map<string, MatchRecord>()).entries()]
        .sort((a, b) => recordMatches(b[1]) - recordMatches(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, limit);
    if (rows.length === 0) return `Aucun matchup connu pour ${legend} sur cette période.`;
    return [`**Matchups de ${legend}** (les plus fréquents) :`, ...rows.map(([opponent, record]) => `- contre ${opponent} : ${rateText(record)}`)].join("\n");
}

export function describeMatchup(legend: string, opponent: string, record: MatchRecord | undefined): string {
    if (!record || recordMatches(record) === 0) return `Aucun match ${legend} contre ${opponent} sur cette période.`;
    return `**${legend} contre ${opponent}** : ${rateText(record)}.`;
}

// --- Tournois ---

export function describeTournamentLine(summary: TournamentSummary, hasMatches: boolean): string {
    return (
        `- ${day(summary.date)} · ${summary.source} — ${plural(summary.decks, "deck")}` +
        (summary.winner ? `, vainqueur : ${summary.winner.legend ?? "légende inconnue"}${summary.winner.pilot ? ` (${summary.winner.pilot})` : ""}` : "") +
        (summary.topLegend ? `, légende la plus jouée : ${summary.topLegend.name} (${percent(summary.topLegend.share)})` : "") +
        (hasMatches ? ", matchs importés" : "")
    );
}

/** Les tournois qui répondent à une recherche par nom, et à une date si elle est donnée. */
export function findTournaments(summaries: TournamentSummary[], query: string, date?: string): TournamentSummary[] {
    const onDate = date ? summaries.filter((summary) => summary.date === date) : summaries;
    const bySlug = onDate.filter((summary) => summary.slug === query.trim().toLowerCase());
    return bySlug.length > 0 ? bySlug : matchByName(onDate, (summary) => summary.source, query);
}

/** Les joueurs du top, avec leur bilan et leur légende. */
function describeTopPlayers(players: MetaEventPlayer[]): string[] {
    return players.map((player) => `- ${player.place}. ${player.name} — ${player.record}${player.legend ? ` · ${player.legend}` : ""}`);
}

export function describeTournament(
    summary: TournamentSummary,
    stats: TournamentStats,
    options: {
        matches?: { totals: MatchTotals; top: MetaEventPlayer[]; players: number };
        deckLink: (deckId: string) => string;
        /** Pour nommer la légende de chaque deck. */
        cards: Record<string, MetaCard>;
    },
): string {
    const lines = [
        `**${summary.source}** — ${day(summary.date)}, ${plural(stats.decks, "deck")} relevé${stats.decks > 1 ? "s" : ""} (${stats.ranked} classé${stats.ranked > 1 ? "s" : ""}).`,
    ];

    if (stats.topCut.length > 0) {
        lines.push("", "**Top 8 (decks)** :");
        for (const deck of stats.topCut) {
            lines.push(
                `- ${deck.placement ?? "?"} · ${legendLabel(deck, options.cards) ?? deck.name}${deck.pilot ? ` (${deck.pilot})` : ""} · ${domainsLabel(deck.domains)} — id ${deck.id} · ${options.deckLink(deck.id)}`,
            );
        }
    }

    if (stats.legends.length > 0) {
        lines.push("", "**Légendes** :");
        for (const legend of stats.legends.slice(0, 12)) {
            lines.push(
                `- ${legend.name} — ${plural(legend.decks, "deck")} (${percent(legend.share)})` +
                (legend.topCuts > 0 ? `, ${legend.topCuts} en top 8 (${percent(legend.topShare)} du top)` : "") +
                (legend.best ? `, meilleur classement ${legend.best}` : ""),
            );
        }
        if (stats.legends.length > 12) lines.push(`- … et ${stats.legends.length - 12} autres`);
    }

    if (stats.combos.length > 0) {
        lines.push("", "**Combinaisons de domaines** :");
        lines.push(
            stats.combos
                .slice(0, 8)
                .map((combo) => `${domainsLabel(combo.domains)} ${percent(combo.share)}${combo.topDecks > 0 ? ` (${combo.topDecks} en top 8)` : ""}`)
                .join(" · "),
        );
    }

    if (stats.cardsUp.length > 0 || stats.cardsDown.length > 0) {
        lines.push("", "**Ce qui distingue le top 8** (part des decks du top 8, contre le reste) :");
        if (stats.cardsUp.length > 0) lines.push(`Plus jouées : ${stats.cardsUp.map((card) => `${card.name} ${percent(card.top)} / ${percent(card.rest)}`).join(", ")}.`);
        if (stats.cardsDown.length > 0) lines.push(`Moins jouées : ${stats.cardsDown.map((card) => `${card.name} ${percent(card.top)} / ${percent(card.rest)}`).join(", ")}.`);
    }

    if (options.matches) {
        const { totals, top, players } = options.matches;
        lines.push("", `**Matchs** : ${plural(players, "joueur")}, ${plural(totals.rounds, "ronde")}, ${plural(totals.matches, "match", "matchs")} (${plural(totals.draws, "nul")}).`);
        if (top.length > 0) lines.push("Classement final :", ...describeTopPlayers(top));
    }

    return lines.join("\n");
}
