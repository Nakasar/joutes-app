/**
 * Les decks de l'utilisateur dans le serveur MCP, en fonctions pures : ce que
 * l'éditeur de deck intégré à Claude reçoit, et les textes que lit le modèle.
 *
 * Le contenu se compte et se range avec les mêmes fonctions que l'éditeur du
 * site (`lib/decks/contents.ts`, `routing.ts`, `zones.ts`) : un deck ne doit
 * pas être conforme dans Claude et « à ajuster » sur Joutes.
 */

import {
    changeCardQuantity,
    deckCardIds,
    deckLegality,
    deckSize,
    isDeckCompliant,
    maxCopies,
    zoneEntries,
    type DeckCardInfo,
    type DeckCards,
} from "@/lib/decks/contents";
import { zonesForDeck } from "@/lib/decks/extra-legends";
import { routeCardToZone, zoneHoldingCard } from "@/lib/decks/routing";
import { normalizeCardName } from "@/lib/decks/text";
import { zoneCounterLabel, type DeckZone, type DeckZoneKey } from "@/lib/decks/zones";
import type { Deck } from "@/lib/types/Deck";
import type {
    DeckCardChange,
    DeckEditorDeck,
    DeckEditorSummary,
} from "@/mcp-apps/deck-editor/result";

/** Exemplaires d'une même carte que le format autorise, quand il en fixe un. */
export const DECK_COPY_LIMITS: Record<string, number> = { riftbound: 3 };

export const VISIBILITY_LABELS = {
    private: "privé",
    unlisted: "non répertorié",
    public: "public",
} as const;

function isoDate(value: unknown): string | undefined {
    if (value instanceof Date) return value.toISOString();
    return typeof value === "string" ? value : undefined;
}

/** Le deck tel que la vue l'édite. */
export function deckEditorDeck(
    deck: Deck,
    game: { name?: string; slug?: string } | null | undefined,
    zones: DeckZone[],
    catalog: DeckCardInfo[],
    owned: Map<string, number> | Record<string, number>,
    links: { url: string; editUrl: string },
): DeckEditorDeck {
    const gameSlug = game?.slug ?? deck.gameId;
    return {
        id: deck.id,
        name: deck.name,
        gameId: deck.gameId,
        gameName: game?.name,
        gameSlug,
        visibility: deck.visibility,
        version: deck.version ?? 1,
        cards: deck.cards ?? {},
        zones,
        catalog,
        owned: owned instanceof Map ? Object.fromEntries(owned) : owned,
        copyLimit: game?.slug ? DECK_COPY_LIMITS[game.slug] : undefined,
        updatedAt: isoDate(deck.updatedAt),
        url: links.url,
        editUrl: links.editUrl,
    };
}

/** Une ligne de la liste « Mes decks ». */
export function deckEditorSummary(
    deck: Deck,
    game: { name?: string; slug?: string } | null | undefined,
    zones: DeckZone[],
): DeckEditorSummary {
    return {
        id: deck.id,
        name: deck.name,
        gameName: game?.name,
        gameSlug: game?.slug,
        legendName: deck.legendName,
        coverImage: deck.coverImage,
        size: deckSize(deck.cards, zonesForDeck(zones, deck.cards)),
        compliant: isDeckCompliant(deck.cards, zonesForDeck(zones, deck.cards)),
        updatedAt: isoDate(deck.updatedAt),
    };
}

/**
 * Retrouve une zone par sa clé ou son libellé (« runes », « Deck principal »,
 * « Principal »), sans casse ni accents : le modèle écrit ce que l'utilisateur
 * a dit.
 */
export function findZone(zones: DeckZone[], name: string): DeckZone | undefined {
    const target = normalizeCardName(name);
    return zones.find((zone) =>
        [zone.key, zone.label, zone.short].some((candidate) => normalizeCardName(candidate) === target)
    );
}

export type AppliedDeckChanges = {
    cards: DeckCards;
    /** Une ligne par changement appliqué : « +3 Void Seeker (Deck principal) ». */
    applied: string[];
    /** Ce qui n'a pas pu s'appliquer, avec la raison. */
    skipped: string[];
};

/**
 * Applique des changements demandés par nom de carte.
 *
 * Sans zone, un ajout suit le rangement automatique de l'éditeur (la légende
 * dans sa zone, la première unité championne au champion choisi…) et un
 * retrait part de la zone où la carte se trouve. Un retrait ne descend jamais
 * sous zéro : retirer quatre exemplaires d'une carte qui en compte deux les
 * retire tous les deux.
 *
 * `cardsByName` est indexé par nom normalisé (`normalizeCardName`).
 */
export function applyDeckChanges(
    cards: DeckCards,
    zones: DeckZone[],
    changes: DeckCardChange[],
    cardsByName: Map<string, DeckCardInfo>,
): AppliedDeckChanges {
    let next: DeckCards = cards;
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const change of changes) {
        const card = cardsByName.get(normalizeCardName(change.cardName));
        if (!card) {
            skipped.push(`${change.cardName} : carte introuvable dans ce jeu.`);
            continue;
        }
        if (!Number.isInteger(change.quantity) || change.quantity === 0) {
            skipped.push(`${card.name} : quantité nulle, rien à faire.`);
            continue;
        }

        let zoneKey: DeckZoneKey | undefined;
        if (change.zone) {
            const zone = findZone(zones, change.zone);
            if (!zone) {
                skipped.push(`${card.name} : zone « ${change.zone} » inconnue (${zones.map((z) => z.label).join(", ")}).`);
                continue;
            }
            zoneKey = zone.key;
        }

        // Exemplaire par exemplaire, comme l'éditeur du site et l'import texte :
        // le premier Jinx prend la place du champion choisi, les suivants vont
        // au deck principal. Les zones suivent le contenu (Neeko).
        const moved = new Map<DeckZoneKey, number>();
        const count = Math.abs(change.quantity);
        for (let copy = 0; copy < count; copy++) {
            const current = zonesForDeck(zones, next);
            let target: DeckZoneKey | undefined;
            if (change.quantity > 0) {
                target = zoneKey ?? routeCardToZone(card, current, next);
            } else {
                const from = zoneKey ?? zoneHoldingCard(card, current, next);
                const held = from ? zoneEntries(next, from).find((entry) => entry.cardId === card.id)?.quantity ?? 0 : 0;
                target = held > 0 ? from : undefined;
            }
            if (!target) break;
            next = changeCardQuantity(next, target, card.id, change.quantity > 0 ? 1 : -1);
            moved.set(target, (moved.get(target) ?? 0) + 1);
        }

        if (moved.size === 0) {
            skipped.push(`${card.name} : pas dans ${zoneKey ? `la zone ${zoneLabel(zones, zoneKey)}` : "le deck"}.`);
            continue;
        }
        for (const [key, quantity] of moved) {
            applied.push(`${change.quantity > 0 ? "+" : "−"}${quantity} ${card.name} (${zoneLabel(zones, key)})`);
        }
    }

    return { cards: next, applied, skipped };
}

function zoneLabel(zones: DeckZone[], key: DeckZoneKey): string {
    return zones.find((zone) => zone.key === key)?.label ?? key;
}

/** L'état de chaque zone, en une ligne : « Runes 6 / 12 (à ajuster) ». */
export function describeLegality(cards: DeckCards | undefined, gameZones: DeckZone[], copyLimit?: number): string[] {
    // Les bornes suivent le contenu, comme sur le site : avec Neeko, quatre légendes.
    const zones = zonesForDeck(gameZones, cards);
    const lines = deckLegality(cards, zones).map((row) =>
        `${row.zone.label} ${zoneCounterLabel(row.zone, row.count, row.contributed)} — ${row.zone.rule} : ${row.compliant ? "conforme" : "à ajuster"}`
    );
    if (copyLimit !== undefined) {
        const most = maxCopies(cards, zones);
        if (most > copyLimit) lines.push(`Une carte dépasse ${copyLimit} exemplaires (${most}) : à ajuster`);
    }
    return lines;
}

/** Le deck entier, pour le modèle : zones, cartes et légalité. */
export function describeDeck(deck: DeckEditorDeck): string {
    const byId = new Map(deck.catalog.map((card) => [card.id, card]));
    const lines = [
        `**${deck.name}** — ${deck.gameName ?? deck.gameSlug}, ${VISIBILITY_LABELS[deck.visibility]}, version ${deck.version}`,
        `ID du deck : ${deck.id}`,
        "",
        "Légalité :",
        ...describeLegality(deck.cards, deck.zones, deck.copyLimit).map((line) => `- ${line}`),
    ];

    for (const zone of deck.zones) {
        const entries = zoneEntries(deck.cards, zone.key);
        if (entries.length === 0) continue;
        lines.push("", `${zone.label} :`);
        for (const entry of entries) {
            const card = byId.get(entry.cardId);
            const owned = deck.owned[entry.cardId];
            const details = [card?.type, card?.cost !== undefined ? `coût ${card.cost}` : undefined, owned !== undefined ? `${owned} possédée(s)` : undefined]
                .filter(Boolean)
                .join(", ");
            lines.push(`- ${entry.quantity} ${card?.name ?? entry.cardId}${details ? ` (${details})` : ""}`);
        }
    }

    if (deckCardIds(deck.cards).length === 0) {
        lines.push("", "Le deck est vide.");
    }

    return lines.join("\n");
}

/** La liste « Mes decks », pour le modèle. */
export function describeDeckList(decks: DeckEditorSummary[], total: number): string {
    if (decks.length === 0) {
        return "Aucun deck trouvé.";
    }
    const lines = decks.map((deck) =>
        `- **${deck.name}** (ID: ${deck.id}) — ${[deck.gameName, deck.legendName, `${deck.size} cartes`, deck.compliant ? "conforme" : "à ajuster"].filter(Boolean).join(", ")}`
    );
    const more = total > decks.length ? `\n\n${total - decks.length} autre(s) deck(s) : affiner avec \`search\` ou \`gameName\`.` : "";
    return `${total} deck(s) :\n${lines.join("\n")}${more}`;
}

/** Ce que le modèle lit après des changements. */
export function describeChanges(result: AppliedDeckChanges, deck: DeckEditorDeck): string {
    const parts = [
        result.applied.length > 0
            ? `Deck **${deck.name}** modifié (version ${deck.version}) :\n${result.applied.map((line) => `- ${line}`).join("\n")}`
            : `Aucun changement appliqué au deck **${deck.name}**.`,
    ];
    if (result.skipped.length > 0) {
        parts.push(`Non appliqué :\n${result.skipped.map((line) => `- ${line}`).join("\n")}`);
    }
    parts.push(`Légalité :\n${describeLegality(deck.cards, deck.zones, deck.copyLimit).map((line) => `- ${line}`).join("\n")}`);
    return parts.join("\n\n");
}
