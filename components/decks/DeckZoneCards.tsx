import { cardReference, DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { cn } from "@/lib/utils.ts";
import { zoneCount, zoneEntries, type DeckCardInfo, type DeckCards } from "@/lib/decks/contents.ts";
import { zoneCounterLabel, type DeckZone } from "@/lib/decks/zones.ts";

/**
 * Contenu d'un deck en lecture seule, zone par zone.
 *
 * La fiche montre le deck, elle ne le modifie pas : changer une quantité
 * demande d'ouvrir l'éditeur. Deux densités, l'une pour la fiche du
 * propriétaire (vignettes), l'autre pour la page publique (lignes).
 */
export function DeckZoneCards({
  cards,
  zones,
  cardsById,
  variant = "grid",
  ownedByCardId,
}: {
  cards: DeckCards | undefined;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
  variant?: "grid" | "list";
  /** Exemplaires possédés en collection, par identifiant de carte. */
  ownedByCardId?: Map<string, number>;
}) {
  const filled = zones.filter((zone) => zoneEntries(cards, zone.key).length > 0);

  if (filled.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ce deck n&apos;a pas encore de cartes. Ouvrez l&apos;éditeur pour le construire.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {filled.map((zone, index) => (
        <section key={zone.key} className={cn("flex flex-col gap-2.5", index > 0 && "border-t pt-3.5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold">{zone.label}</h3>
            <span className="font-mono text-xs text-muted-foreground">
              {zoneCounterLabel(zone, zoneCount(cards, zone.key))}
            </span>
          </div>

          {variant === "grid" ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2.5">
              {zoneEntries(cards, zone.key).map((entry) => {
                const card = cardsById.get(entry.cardId);

                return (
                  <li key={entry.cardId} className="flex flex-col gap-1">
                    <span className="relative block">
                      <DeckCardThumb card={card} name={entry.cardId} />
                      <span className="absolute right-1 top-1 min-w-5 rounded-full border bg-background/92 px-1.5 py-px text-center font-mono text-[11px]">
                        {entry.quantity}
                      </span>
                    </span>
                    <span className="truncate text-[11px]" title={card?.name}>
                      {card?.name ?? entry.cardId}
                    </span>
                    {cardReference(card) && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {cardReference(card)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {zoneEntries(cards, zone.key).map((entry) => {
                const card = cardsById.get(entry.cardId);
                const owned = ownedByCardId?.get(entry.cardId);

                return (
                  <li
                    key={entry.cardId}
                    className="flex items-center gap-3 border-b py-2 last:border-b-0"
                  >
                    <span className="w-5 shrink-0 font-mono text-sm">{entry.quantity}</span>
                    <DeckCardThumb card={card} name={entry.cardId} className="w-8 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm">{card?.name ?? entry.cardId}</span>
                    {owned !== undefined && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {owned} en collection
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** Résumé « Contenu du deck » : une ligne par zone, plus le total. */
export function DeckZonesSummary({
  cards,
  zones,
}: {
  cards: DeckCards | undefined;
  zones: DeckZone[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {zones.map((zone) => (
        <div key={zone.key} className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">{zone.label}</span>
          <span className="font-mono text-xs">{zoneCount(cards, zone.key)}</span>
        </div>
      ))}
    </div>
  );
}
