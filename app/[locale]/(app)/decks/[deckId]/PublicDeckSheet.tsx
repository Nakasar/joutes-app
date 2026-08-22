import { DateTime } from "luxon";
import { Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import ReportButton from "@/components/ReportButton.tsx";
import FavoriteDeckButton from "../FavoriteDeckButton.tsx";
import { CopyDeckButton } from "@/components/decks/CopyDeckButton.tsx";
import { CostCurve, LegalityList } from "@/components/decks/DeckAnalysis.tsx";
import { DeckVisibilityBadge, DeckSizeLabel } from "@/components/decks/DeckBadges.tsx";
import { DeckZoneCards } from "@/components/decks/DeckZoneCards.tsx";
import { SheetCard } from "./DeckSheetSections.tsx";
import type { DeckCardInfo } from "@/lib/decks/contents.ts";
import type { DeckZone } from "@/lib/decks/zones.ts";
import type { Deck } from "@/lib/types/Deck.ts";

/**
 * Fiche d'un deck vue par quelqu'un d'autre que son auteur.
 *
 * Lecture seule, et centrée sur la décision que prend un visiteur : cette liste
 * est-elle jouable, et est-ce que je la reprends ? D'où la légalité et la
 * courbe en évidence, et « Copier chez moi » comme action principale.
 */
export function PublicDeckSheet({
  deck,
  gameName,
  zones,
  catalog,
  isFavorited,
  isAuthenticated,
  ownedByCardId,
}: {
  deck: Deck;
  gameName?: string;
  zones: DeckZone[];
  catalog: DeckCardInfo[];
  isFavorited: boolean;
  isAuthenticated: boolean;
  ownedByCardId?: Record<string, number>;
}) {
  const cardsById = new Map(catalog.map((card) => [card.id, card]));
  const owned = ownedByCardId ? new Map(Object.entries(ownedByCardId)) : undefined;
  const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");

  const meta = [
    deck.creatorName ? `par ${deck.creatorName}` : undefined,
    deck.legendName,
    deck.format,
    `modifié ${updatedAt.toRelative()}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <nav className="text-[13px] text-muted-foreground">
            <Link href="/decks/library" className="hover:text-foreground">
              Librairie de decks
            </Link>
            {gameName && <> / {gameName}</>}
          </nav>

          <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{deck.name}</h1>
          <p className="text-sm text-muted-foreground">{meta}</p>

          <div className="flex flex-wrap items-center gap-2">
            <DeckVisibilityBadge visibility={deck.visibility} />
            <DeckSizeLabel cards={deck.cards} zones={zones} />
            <span className="font-mono text-xs text-muted-foreground">
              {deck.views ?? 0} vue{(deck.views ?? 0) > 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAuthenticated && (
              <FavoriteDeckButton
                deckId={deck.id}
                isFavorited={isFavorited}
                size="default"
                showLabel={false}
                className="gap-2"
              />
            )}
            {isAuthenticated && <CopyDeckButton deckId={deck.id} />}
            <ReportButton contentType="deck" contentId={deck.id} />
          </div>
        </header>

        {deck.description && (
          <SheetCard title="Description">
            <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6 text-pretty">
              {deck.description}
            </p>
          </SheetCard>
        )}

        <SheetCard title="Cartes du deck" meta={<DeckSizeLabel cards={deck.cards} zones={zones} />}>
          <DeckZoneCards
            cards={deck.cards}
            zones={zones}
            cardsById={cardsById}
            variant="list"
            ownedByCardId={owned}
          />
        </SheetCard>

        {(deck.guide?.length ?? 0) > 0 && (
          <SheetCard
            title="Guide"
            meta={
              <span className="text-xs text-muted-foreground">
                {deck.guide!.length} section{deck.guide!.length > 1 ? "s" : ""}
              </span>
            }
          >
            <div className="flex flex-col gap-3.5">
              {deck.guide!.map((section, index) => (
                <article
                  key={section.title + index}
                  className="flex flex-col gap-1.5 border-t pt-3.5 first:border-t-0 first:pt-0"
                >
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  <p className="max-w-[68ch] whitespace-pre-wrap text-sm leading-[22px] text-muted-foreground">
                    {section.body}
                  </p>
                </article>
              ))}
            </div>
          </SheetCard>
        )}
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
        <SheetCard title="Courbe de coûts" className="gap-3 p-4">
          <CostCurve cards={deck.cards} zones={zones} cardsById={cardsById} />
        </SheetCard>

        <SheetCard title="Légalité" className="gap-3 p-4">
          <LegalityList cards={deck.cards} zones={zones} />
        </SheetCard>

        <SheetCard
          title="Résultats en tournoi"
          className="gap-3 p-4"
          meta={<Trophy className="size-3.5 text-muted-foreground" aria-hidden />}
        >
          {/*
            Les résultats se rattacheront aux tournois du site quand un deck
            pourra y être inscrit. D'ici là, mieux vaut une phrase honnête
            qu'un palmarès inventé.
          */}
          <p className="text-[13px] text-muted-foreground">
            Aucun résultat enregistré pour cette liste.
          </p>
        </SheetCard>
      </aside>
    </div>
  );
}
