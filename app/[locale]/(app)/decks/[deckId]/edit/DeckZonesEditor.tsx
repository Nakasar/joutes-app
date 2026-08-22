"use client";

import { Minus, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cardReference, DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { cn } from "@/lib/utils.ts";
import { zoneCount, zoneEntries, type DeckCardInfo, type DeckCards } from "@/lib/decks/contents.ts";
import { isZoneCompliant, zoneCounterLabel, type DeckZone, type DeckZoneKey } from "@/lib/decks/zones.ts";

/**
 * Les zones du deck, au centre de l'éditeur.
 *
 * Chaque en-tête porte son compteur, sa règle et son état : la conformité se
 * lit zone par zone, à l'endroit où on la corrige, plutôt que dans un verdict
 * global qui ne dit pas quoi changer.
 */
export function DeckZonesEditor({
  cards,
  zones,
  cardsById,
  view,
  ownedByCardId,
  onChangeAction,
  onPreviewAction,
}: {
  cards: DeckCards;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
  view: "grid" | "list";
  ownedByCardId?: Map<string, number>;
  onChangeAction: (zone: DeckZoneKey, cardId: string, delta: number) => void;
  onPreviewAction?: (card: DeckCardInfo) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {zones.map((zone) => {
        const count = zoneCount(cards, zone.key);
        const compliant = isZoneCompliant(zone, count);
        const entries = zoneEntries(cards, zone.key);

        return (
          <section key={zone.key} className="overflow-hidden rounded-xl border">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold">{zone.label}</h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {zoneCounterLabel(zone, count)}
                </span>
                <span className="text-xs text-muted-foreground">{zone.rule}</span>
              </div>
              <Badge
                variant="secondary"
                className={cn(!compliant && "bg-destructive/10 text-destructive")}
              >
                {compliant ? "conforme" : "à ajuster"}
              </Badge>
            </header>

            {entries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Zone vide. Choisissez-la dans le catalogue pour y ajouter des cartes.
              </p>
            ) : view === "grid" ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 p-4">
                {entries.map((entry) => {
                  const card = cardsById.get(entry.cardId);

                  return (
                    <li key={entry.cardId} className="flex flex-col gap-1">
                      <span
                        className="relative block"
                        onMouseEnter={() => card && onPreviewAction?.(card)}
                      >
                        <DeckCardThumb card={card} name={entry.cardId} />
                        <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full border bg-background/90 p-0.5">
                          <Stepper
                            label={card?.name ?? entry.cardId}
                            quantity={entry.quantity}
                            size={22}
                            onChangeAction={(delta) => onChangeAction(zone.key, entry.cardId, delta)}
                          />
                        </span>
                      </span>
                      <span className="truncate text-xs font-semibold" title={card?.name}>
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
              <ul>
                {entries.map((entry) => {
                  const card = cardsById.get(entry.cardId);
                  const owned = ownedByCardId?.get(entry.cardId);

                  return (
                    <li
                      key={entry.cardId}
                      className="flex flex-wrap items-center gap-3 border-b px-4 py-2 last:border-b-0"
                      onMouseEnter={() => card && onPreviewAction?.(card)}
                    >
                      <DeckCardThumb card={card} name={entry.cardId} className="w-8 shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{card?.name ?? entry.cardId}</span>
                        {cardReference(card) && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {cardReference(card)}
                          </span>
                        )}
                      </span>
                      <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">
                        {card?.type}
                      </span>
                      <span className="hidden w-14 shrink-0 text-right font-mono text-xs sm:block">
                        {card?.cost ?? "—"}
                      </span>
                      {owned !== undefined && (
                        <span className="hidden w-24 shrink-0 text-xs text-muted-foreground md:block">
                          {owned} / {entry.quantity}
                        </span>
                      )}
                      <span className="flex shrink-0 items-center gap-1">
                        <Stepper
                          label={card?.name ?? entry.cardId}
                          quantity={entry.quantity}
                          size={26}
                          onChangeAction={(delta) => onChangeAction(zone.key, entry.cardId, delta)}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Réglage de la quantité d'une carte.
 *
 * Les deux boutons portent un libellé qui nomme la carte : sans lui, un lecteur
 * d'écran n'entendrait qu'une file de « plus » et de « moins » identiques.
 */
export function Stepper({
  quantity,
  label,
  size,
  onChangeAction,
}: {
  quantity: number;
  label: string;
  size: number;
  onChangeAction: (delta: number) => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        style={{ width: size, height: size }}
        aria-label={`Retirer un exemplaire de ${label}`}
        onClick={() => onChangeAction(-1)}
      >
        <Minus />
      </Button>
      <span className="min-w-4 text-center font-mono text-xs">{quantity}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        style={{ width: size, height: size }}
        aria-label={`Ajouter un exemplaire de ${label}`}
        onClick={() => onChangeAction(1)}
      >
        <Plus />
      </Button>
    </>
  );
}
