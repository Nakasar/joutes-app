import { editionPrinting, printingEdition } from "@/lib/cards/printings";
import { formatCardPrice } from "@/lib/prices/display";
import type { CardPrinting } from "@/lib/types/card";
import type { Booster, BoosterCard, BoosterValue } from "@/lib/types/booster";

/**
 * Textes et résolutions des outils MCP sur les boosters, sans base de données :
 * ce que l'assistant lit d'un booster, et comment un nom d'édition ou de
 * variante qu'il a reçu en langage naturel devient une variante du catalogue.
 */

/** Une édition de variante proposée sur les cartes d'un booster (« Beta », « Showcase »…). */
export type BoosterEdition = { key: string; name: string };

/** Mots qui désignent la version de base d'une carte, plutôt qu'une de ses variantes. */
const BASE_EDITION_WORDS = new Set(["", "base", "normal", "normale", "standard", "defaut", "default"]);

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function isBaseEdition(query: string): boolean {
    return BASE_EDITION_WORDS.has(fold(query));
}

/** Les éditions dans lesquelles au moins une carte du booster existe, dans l'ordre où elles apparaissent. */
export function boosterEditions(cards: Pick<BoosterCard, "printings">[]): BoosterEdition[] {
    const editions = new Map<string, BoosterEdition>();
    for (const card of cards) {
        for (const printing of card.printings ?? []) {
            const edition = printingEdition(printing);
            if (!editions.has(edition.key)) editions.set(edition.key, edition);
        }
    }
    return [...editions.values()];
}

/**
 * Retrouve une édition par son nom (sans tenir compte de la casse ni des
 * accents) ou par sa clé. `null` pour la version de base, `undefined` si rien
 * ne correspond.
 */
export function findEdition(editions: BoosterEdition[], query: string): BoosterEdition | null | undefined {
    if (isBaseEdition(query)) return null;
    const wanted = fold(query);
    return editions.find((edition) => fold(edition.name) === wanted || edition.key === wanted);
}

/**
 * La variante d'une carte désignée par son identifiant, son nom exact ou le
 * nom de son édition (« Beta » pour « Beta 141 »). `null` pour la version de
 * base, `undefined` si la carte n'a pas cette variante.
 */
export function findCardPrinting(
    card: { collectorNumber?: string; printings?: CardPrinting[] },
    query: string,
): CardPrinting | null | undefined {
    if (isBaseEdition(query)) return null;
    const wanted = fold(query);
    const printings = card.printings ?? [];
    const exact = printings.find((printing) => printing.id === query || fold(printing.name) === wanted);
    if (exact) return exact;
    const edition = boosterEditions([card]).find((item) => fold(item.name) === wanted || item.key === wanted);
    return edition ? editionPrinting(card, edition.key) : undefined;
}

export function formatBoosterValue(value: BoosterValue | undefined): string {
    if (!value) return "non estimée";
    if (value.pricedCards === 0) return "aucune carte cotée";
    const amount = formatCardPrice({ amount: value.amount, currency: value.currency }, "fr");
    return value.pricedCards < value.cardCount
        ? `${amount} (${value.pricedCards}/${value.cardCount} cartes cotées)`
        : amount;
}

function formatDate(iso: string): string {
    return iso.slice(0, 10);
}

/** Une ligne de la liste des boosters. */
export function describeBoosterLine(booster: Booster, typeLabel: string, gameName?: string): string {
    const parts = [
        `${formatDate(booster.createdAt)} — ${typeLabel}`,
        `${booster.setCode} (${booster.lang.toUpperCase()})`,
        `${booster.cards.length} carte(s)`,
    ];
    if (gameName) parts.unshift(gameName);
    if (booster.estimatedValue?.pricedCards) parts.push(`valeur ${formatBoosterValue(booster.estimatedValue)}`);
    if (booster.addedToCollection) parts.push("dans la collection");
    const note = booster.note ? ` — « ${booster.note} »` : "";
    return `- **${booster.id}** : ${parts.join(", ")}${note}`;
}

/** Une ligne par exemplaire, avec l'identifiant qui sert à le modifier ou le retirer. */
export function describeBoosterCard(card: BoosterCard): string {
    const tags = [
        card.foil ? "foil" : undefined,
        card.printingName,
    ].filter(Boolean);
    return `- ${card.name}${card.subtitle ? `, ${card.subtitle}` : ""} (${card.setCode} #${card.collectorNumber})` +
        `${tags.length > 0 ? ` [${tags.join(", ")}]` : ""} — exemplaire \`${card.id}\``;
}

/** Le détail d'un booster : en-tête, contenu, éditions de variantes possibles. */
export function describeBooster(booster: Booster, typeLabel: string, gameName: string): string {
    const lines = [
        `Booster **${booster.id}** — ${gameName}, ${typeLabel}, ${booster.setCode} (${booster.lang.toUpperCase()}), ouvert le ${formatDate(booster.createdAt)}.`,
        `Valeur : ${formatBoosterValue(booster.estimatedValue)}.`,
        booster.addedToCollection ? "Ses cartes sont dans la collection." : "Ses cartes ne sont pas (encore) dans la collection.",
    ];
    if (booster.note) lines.push(`Note : « ${booster.note} »`);

    lines.push("", `${booster.cards.length} carte(s) :`);
    lines.push(...(booster.cards.length > 0 ? booster.cards.map(describeBoosterCard) : ["(vide)"]));

    const editions = boosterEditions(booster.cards);
    if (editions.length > 0) {
        lines.push("", `Variantes possibles : ${editions.map((edition) => edition.name).join(", ")}.`);
    }
    return lines.join("\n");
}

/**
 * Rappel ajouté quand le contenu d'un booster change alors qu'il a déjà été
 * versé dans la collection : la collection garde les cartes d'alors.
 */
export const COLLECTION_NOT_SYNCED_NOTE =
    "\n\nCe booster est déjà dans la collection, qui n'a pas changé : retirez-le de la collection puis rajoutez-le pour la mettre à jour.";
