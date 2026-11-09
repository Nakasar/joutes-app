import type { DeckCards } from "@/lib/decks/contents";

/**
 * Les domaines d'un deck : ceux qu'il joue, pour le filtre de la librairie,
 * ses pastilles et la méta.
 *
 * Avec une légende qui porte des domaines, ce sont les siens : en Riftbound,
 * la légende fixe les domaines du deck, et le reste du contenu ne fait que
 * s'y ranger. Sans légende, l'union des domaines des cartes jouées.
 *
 * Ni la réserve (des cartes hors du deck joué) ni les champs de bataille
 * (neutres, souvent marqués « Colorless » au catalogue) n'en ajoutent, et
 * « Colorless » n'est jamais un domaine : c'est l'absence de domaine.
 */
const COLORLESS_VALUES = new Set(["colorless", "incolore"]);
const ZONES_WITHOUT_DOMAINS = new Set(["sideboard", "battlefields"]);

/** Vrai pour un vrai domaine ; faux pour « Colorless » et les valeurs vides. */
export function isPlayableDomain(domain: string): boolean {
  const value = domain.trim().toLowerCase();
  return value !== "" && !COLORLESS_VALUES.has(value);
}

/** Les domaines d'une carte, sans « Colorless ». */
export function playableDomains(domains: readonly string[] | undefined): string[] {
  return (domains ?? []).filter(isPlayableDomain);
}

function sorted(domains: Iterable<string>): string[] {
  return [...new Set(domains)].sort((a, b) => a.localeCompare(b, "fr"));
}

export function computeDeckDomains(
  cards: DeckCards | undefined,
  domainsOf: (cardId: string) => readonly string[] | undefined,
  legendCardId?: string
): string[] {
  const legendId = legendCardId ?? cards?.legend?.[0]?.cardId;
  const legendDomains = legendId ? playableDomains(domainsOf(legendId)) : [];
  if (legendDomains.length > 0) return sorted(legendDomains);

  const domains: string[] = [];
  for (const [zone, entries] of Object.entries(cards ?? {})) {
    if (ZONES_WITHOUT_DOMAINS.has(zone)) continue;
    for (const entry of entries ?? []) domains.push(...playableDomains(domainsOf(entry.cardId)));
  }
  return sorted(domains);
}
