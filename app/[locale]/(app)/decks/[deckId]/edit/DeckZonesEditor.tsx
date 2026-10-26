"use client";

import { useState } from "react";
import { Minus, MoreHorizontal, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { cardReference, DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { OwnedBadge } from "@/components/decks/OwnedBadge.tsx";
import { cn } from "@/lib/utils.ts";
import {
  deckLegality,
  zoneEntries,
  type DeckCardEntry,
  type DeckCardInfo,
  type DeckCards,
} from "@/lib/decks/contents.ts";
import { zoneCounterLabel, type DeckZone, type DeckZoneKey } from "@/lib/decks/zones.ts";

/**
 * Une carte en cours de glisser : depuis le catalogue (`from` absent) ou
 * depuis une zone du deck.
 *
 * Elle vit dans l'état de l'éditeur plutôt que dans le `dataTransfer` : celui-ci
 * n'est lisible qu'au dépôt, et la zone survolée doit pouvoir dire, avant, ce
 * que le dépôt va faire.
 */
export type DeckDrag = {
  cardId: string;
  card?: DeckCardInfo;
  from?: DeckZoneKey;
  /** Exemplaires dans la zone de départ. */
  quantity?: number;
};

/**
 * Les zones du deck, au centre de l'éditeur.
 *
 * Chaque en-tête porte son compteur, sa règle et son état : la conformité se
 * lit zone par zone, à l'endroit où on la corrige, plutôt que dans un verdict
 * global qui ne dit pas quoi changer.
 *
 * Chaque zone reçoit les cartes qu'on y dépose : depuis le catalogue (un
 * exemplaire) ou depuis une autre zone (tous ses exemplaires, un seul avec
 * Alt). Le menu « ⋯ » de chaque carte fait la même chose sans souris — au
 * doigt, le glisser se confond avec le défilement de la page.
 */
export function DeckZonesEditor({
  cards,
  zones,
  cardsById,
  view,
  ownedByCardId,
  dragging,
  onChangeAction,
  onMoveAction,
  onDragStartAction,
  onDragEndAction,
  onDropAction,
  onPreviewAction,
}: {
  cards: DeckCards;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
  view: "grid" | "list";
  ownedByCardId?: Map<string, number>;
  dragging?: DeckDrag;
  onChangeAction: (zone: DeckZoneKey, cardId: string, delta: number) => void;
  onMoveAction: (from: DeckZoneKey, to: DeckZoneKey, cardId: string, quantity?: number) => void;
  onDragStartAction: (drag: DeckDrag) => void;
  onDragEndAction: () => void;
  onDropAction: (zone: DeckZoneKey, single: boolean) => void;
  onPreviewAction?: (card: DeckCardInfo) => void;
}) {
  const [over, setOver] = useState<DeckZoneKey | undefined>();
  const legality = new Map(deckLegality(cards, zones).map((row) => [row.zone.key, row]));

  // Le besoin d'une carte se cumule sur tout le deck : la pastille « 2/3 »
  // compare la collection à ce que le deck entier demande, pas à une zone.
  const needed = new Map<string, number>();
  for (const zone of zones) {
    for (const entry of zoneEntries(cards, zone.key)) {
      needed.set(entry.cardId, (needed.get(entry.cardId) ?? 0) + entry.quantity);
    }
  }

  const ownedBadge = (cardId: string, className?: string) => {
    const owned = ownedByCardId?.get(cardId);
    return owned === undefined ? null : (
      <OwnedBadge owned={owned} needed={needed.get(cardId)} className={className} />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {zones.map((zone) => {
        const row = legality.get(zone.key);
        const count = row?.count ?? 0;
        const compliant = row?.compliant ?? true;
        const entries = zoneEntries(cards, zone.key);
        const droppable = dragging !== undefined && dragging.from !== zone.key;
        const hovered = droppable && over === zone.key;

        const dragProps = (entry: DeckCardEntry) => ({
          draggable: true,
          onDragStart: (event: React.DragEvent) => {
            event.dataTransfer.effectAllowed = "move";
            // Firefox n'entame aucun glisser sans donnée posée.
            event.dataTransfer.setData("text/plain", cardsById.get(entry.cardId)?.name ?? entry.cardId);
            onDragStartAction({
              cardId: entry.cardId,
              card: cardsById.get(entry.cardId),
              from: zone.key,
              quantity: entry.quantity,
            });
          },
          onDragEnd: () => {
            setOver(undefined);
            onDragEndAction();
          },
        });

        const menu = (entry: DeckCardEntry, label: string) => (
          <CardMoveMenu
            label={label}
            quantity={entry.quantity}
            zones={zones.filter((other) => other.key !== zone.key)}
            onMoveAction={(to, quantity) => onMoveAction(zone.key, to, entry.cardId, quantity)}
            onRemoveAction={() => onChangeAction(zone.key, entry.cardId, -entry.quantity)}
          />
        );

        return (
          <section
            key={zone.key}
            aria-label={zone.label}
            onDragOver={(event) => {
              if (!droppable) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = dragging?.from ? "move" : "copy";
              if (over !== zone.key) setOver(zone.key);
            }}
            onDragLeave={(event) => {
              // Quitter une vignette pour sa voisine déclenche aussi un
              // `dragleave` : seul compte le départ hors de la section.
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setOver((current) => (current === zone.key ? undefined : current));
              }
            }}
            onDrop={(event) => {
              if (!droppable) return;
              event.preventDefault();
              setOver(undefined);
              onDropAction(zone.key, event.altKey);
            }}
            className={cn(
              "overflow-hidden rounded-xl border transition-shadow",
              droppable && "border-dashed",
              hovered && "border-solid border-sky-500 ring-[3px] ring-sky-500/20"
            )}
          >
            <header
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-3",
                hovered && "bg-sky-500/10"
              )}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold">{zone.label}</h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {zoneCounterLabel(zone, count, row?.contributed)}
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

            {hovered && dragging && (
              <p className="mx-4 mt-3 rounded-lg border border-dashed border-sky-500 px-3 py-2 text-center text-xs text-sky-700 dark:text-sky-300">
                {dropHint(dragging, zone, cardsById)}
              </p>
            )}

            {entries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Zone vide. Glissez-y une carte, ou choisissez-la comme zone d&apos;ajout dans le catalogue.
              </p>
            ) : view === "grid" ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 p-4">
                {entries.map((entry) => {
                  const card = cardsById.get(entry.cardId);
                  const label = card?.name ?? entry.cardId;

                  return (
                    <li
                      key={entry.cardId}
                      className={cn(
                        "flex cursor-grab flex-col gap-1 active:cursor-grabbing",
                        dragging?.from === zone.key && dragging.cardId === entry.cardId && "opacity-40"
                      )}
                      {...dragProps(entry)}
                    >
                      <span
                        className="relative block"
                        onMouseEnter={() => card && onPreviewAction?.(card)}
                      >
                        <DeckCardThumb card={card} name={entry.cardId} />
                        <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full border bg-background/90 p-0.5">
                          <Stepper
                            label={label}
                            quantity={entry.quantity}
                            size={22}
                            onChangeAction={(delta) => onChangeAction(zone.key, entry.cardId, delta)}
                          />
                        </span>
                        {ownedBadge(entry.cardId, "absolute bottom-1.5 left-1.5")}
                        <span className="absolute bottom-1.5 right-1.5">{menu(entry, label)}</span>
                      </span>
                      <span className="truncate text-xs font-semibold" title={card?.name}>
                        {label}
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
                  const label = card?.name ?? entry.cardId;

                  return (
                    <li
                      key={entry.cardId}
                      className={cn(
                        "flex cursor-grab flex-wrap items-center gap-3 border-b px-4 py-2 last:border-b-0 active:cursor-grabbing",
                        dragging?.from === zone.key && dragging.cardId === entry.cardId && "opacity-40"
                      )}
                      onMouseEnter={() => card && onPreviewAction?.(card)}
                      {...dragProps(entry)}
                    >
                      <DeckCardThumb card={card} name={entry.cardId} className="w-8 shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{label}</span>
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
                      <span className="w-12 shrink-0">{ownedBadge(entry.cardId)}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Stepper
                          label={label}
                          quantity={entry.quantity}
                          size={26}
                          onChangeAction={(delta) => onChangeAction(zone.key, entry.cardId, delta)}
                        />
                        {menu(entry, label)}
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

/** Ce que le dépôt va faire, dit pendant le survol. */
function dropHint(drag: DeckDrag, zone: DeckZone, cardsById: Map<string, DeckCardInfo>): string {
  const name = drag.card?.name ?? cardsById.get(drag.cardId)?.name ?? "la carte";

  if (!drag.from) {
    return `Relâcher pour ajouter ${name} à « ${zone.label} »`;
  }

  const quantity = drag.quantity ?? 1;
  return quantity > 1
    ? `Relâcher pour déplacer ${quantity} × ${name} ici (Alt : un seul)`
    : `Relâcher pour déplacer ${name} ici`;
}

/**
 * Menu « Déplacer vers » d'une carte du deck : le glisser-déposer pour le
 * clavier et le tactile.
 */
function CardMoveMenu({
  label,
  quantity,
  zones,
  onMoveAction,
  onRemoveAction,
}: {
  label: string;
  quantity: number;
  zones: DeckZone[];
  onMoveAction: (to: DeckZoneKey, quantity?: number) => void;
  onRemoveAction: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="size-6 rounded-full border bg-background/90"
          aria-label={`Déplacer ${label}`}
          // Le menu ne doit pas lancer un glisser de la vignette qui le porte.
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {label} · {quantity} ex.
        </DropdownMenuLabel>
        {zones.map((zone) => (
          <DropdownMenuItem key={zone.key} onSelect={() => onMoveAction(zone.key)}>
            Déplacer vers {zone.label}
          </DropdownMenuItem>
        ))}
        {quantity > 1 &&
          zones.map((zone) => (
            <DropdownMenuItem key={`one-${zone.key}`} onSelect={() => onMoveAction(zone.key, 1)}>
              Déplacer 1 exemplaire vers {zone.label}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemoveAction}>
          Retirer du deck
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
