"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Hammer, Share2, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { CostCurve } from "@/components/decks/DeckAnalysis.tsx";
import { DeckLegalityBadge, DeckSizeLabel, DeckVisibilityBadge } from "@/components/decks/DeckBadges.tsx";
import { DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { DeckZoneCards, DeckZonesSummary } from "@/components/decks/DeckZoneCards.tsx";
import { ShareDeckDialog } from "@/components/decks/ShareDeckDialog.tsx";
import { cn } from "@/lib/utils.ts";
import { zoneEntries, type DeckCardInfo } from "@/lib/decks/contents.ts";
import type { DeckZone } from "@/lib/decks/zones.ts";
import type { Deck, DeckGuideSection, DeckMatchup, DeckVisibility } from "@/lib/types/Deck.ts";
import {
  DescriptionSection,
  GuideSection,
  MatchupsSection,
  SheetCard,
} from "./DeckSheetSections.tsx";

type SheetTab = "description" | "guide" | "cards";

const TABS: { key: SheetTab; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "guide", label: "Guide" },
  { key: "cards", label: "Cartes" },
];

/**
 * Fiche d'un deck, du point de vue de son auteur.
 *
 * C'est la page d'atterrissage d'un deck, pas l'éditeur : on y lit et on y
 * documente. Tout ce qui touche aux cartes passe par « Construire » — la
 * confusion entre lire un deck et le modifier est ce que cette refonte défait.
 *
 * Sous `lg`, la même matière se replie en trois onglets et une barre d'action
 * basse : un pouce n'atteint pas le haut d'un écran de téléphone.
 */
export function DeckSheet({
  deck,
  gameName,
  zones,
  catalog,
  isFavorited,
  exportCode,
}: {
  deck: Deck;
  gameName?: string;
  zones: DeckZone[];
  catalog: DeckCardInfo[];
  isFavorited: boolean;
  exportCode?: string;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(deck.description ?? "");
  const [guide, setGuide] = useState<DeckGuideSection[]>(deck.guide ?? []);
  const [matchups, setMatchups] = useState<DeckMatchup[]>(deck.matchups ?? []);
  const [visibility, setVisibility] = useState<DeckVisibility>(deck.visibility);
  const [favorited, setFavorited] = useState(isFavorited);
  const [favoritesCount, setFavoritesCount] = useState(deck.favoritesCount ?? 0);
  const [shareOpen, setShareOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>("description");

  const cardsById = useMemo(() => new Map(catalog.map((card) => [card.id, card])), [catalog]);
  const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");
  // Une ligne de méta se construit de ce qui existe : un deck sans légende ni
  // format ne doit pas afficher les séparateurs de ce qu'il n'a pas.
  const metaLine = [
    deck.legendName,
    deck.domains?.length ? deck.domains.join(" / ") : undefined,
    deck.format,
    `modifié ${updatedAt.toRelative()}`,
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * Une seule porte pour tout ce qui s'enregistre depuis la fiche : chaque
   * section n'a pas à savoir comment on parle à l'API, ni comment on annonce un
   * échec.
   */
  const patch = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error("Enregistrement impossible", {
          description: data?.error ?? "Le deck n'a pas pu être mis à jour.",
        });
        return false;
      }

      router.refresh();
      return true;
    } catch (error) {
      console.error("Error updating deck:", error);
      toast.error("Enregistrement impossible", { description: "Une erreur est survenue." });
      return false;
    }
  };

  const toggleFavorite = async () => {
    // Optimiste : l'étoile répond au clic, la requête suit. Un aller-retour
    // réseau pour un signet se remarquerait plus que l'erreur qu'il évite.
    const next = !favorited;
    setFavorited(next);
    setFavoritesCount((count) => Math.max(0, count + (next ? 1 : -1)));

    const response = await fetch(`/api/decks/${deck.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    }).catch(() => null);

    if (!response?.ok) {
      setFavorited(!next);
      setFavoritesCount((count) => Math.max(0, count + (next ? -1 : 1)));
      toast.error("Favori non enregistré");
    }
  };

  const cards = deck.cards;
  const keyCards = useMemo(() => {
    // Les « cartes clés » sont les plus jouées du deck : la carte que l'on
    // ouvre en trois exemplaires dit mieux ce qu'est le deck que la première
    // de la liste.
    return zones
      .filter((zone) => zone.curve || zone.key === "legend" || zone.key === "champions")
      .flatMap((zone) => zoneEntries(cards, zone.key))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3);
  }, [cards, zones]);

  const buildButton = (
    <Button asChild className="h-9 px-[18px] font-semibold">
      <Link href={`/decks/${deck.id}/edit`}>
        <Hammer />
        Construire
      </Link>
    </Button>
  );

  const descriptionCard = (
    <DescriptionSection
      description={description}
      onSaveAction={async (value) => {
        const ok = await patch({ description: value });
        if (ok) setDescription(value);
        return ok;
      }}
    />
  );

  const guideCard = (
    <GuideSection
      guide={guide}
      onSaveAction={async (value) => {
        const ok = await patch({ guide: value });
        if (ok) setGuide(value);
        return ok;
      }}
    />
  );

  const cardsCard = (
    <SheetCard
      title="Cartes du deck"
      meta={<DeckSizeLabel cards={cards} zones={zones} />}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href={`/decks/${deck.id}/edit`}>
            <Hammer />
            Construire
          </Link>
        </Button>
      }
    >
      <DeckZoneCards cards={cards} zones={zones} cardsById={cardsById} />
    </SheetCard>
  );

  const matchupsCard = (
    <MatchupsSection
      matchups={matchups}
      editable
      onSaveAction={async (value) => {
        const ok = await patch({ matchups: value });
        if (ok) setMatchups(value);
        return ok;
      }}
    />
  );

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <header className="flex flex-col gap-3">
        <nav className="text-[13px] text-muted-foreground">
          <Link href="/decks" className="hover:text-foreground">
            Mes decks
          </Link>
          {gameName && <> / {gameName}</>}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{deck.name}</h1>
            <p className="text-sm text-muted-foreground">{metaLine}</p>
            <div className="flex flex-wrap items-center gap-2">
              <DeckVisibilityBadge visibility={visibility} />
              <DeckLegalityBadge cards={cards} zones={zones} />
              <DeckSizeLabel cards={cards} zones={zones} version={deck.version} />
            </div>
          </div>

          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            <Button type="button" variant={favorited ? "default" : "outline"} onClick={toggleFavorite}>
              <Star className={favorited ? "fill-current" : undefined} />
              {favoritesCount}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 />
              Partager
            </Button>
            {buildButton}
          </div>
        </div>
      </header>

      {/* Bureau : la fiche et sa colonne d'appui. */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(320px,1fr)_minmax(260px,320px)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {descriptionCard}
          {cardsCard}
          {guideCard}
          {matchupsCard}
        </div>

        <aside className="sticky top-4 flex flex-col gap-3">
          <SheetCard
            title="Contenu du deck"
            className="gap-3 p-4"
            meta={<DeckSizeLabel cards={cards} zones={zones} />}
          >
            <DeckZonesSummary cards={cards} zones={zones} />
            <Button asChild className="w-full">
              <Link href={`/decks/${deck.id}/edit`}>
                <Hammer />
                Construire
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Ouvre l&apos;éditeur avec le catalogue et les zones.
            </p>
          </SheetCard>

          {keyCards.length > 0 && (
            <SheetCard title="Cartes clés" className="gap-3 p-4">
              <ul className="grid grid-cols-3 gap-2">
                {keyCards.map((entry) => {
                  const card = cardsById.get(entry.cardId);
                  return (
                    <li key={entry.cardId} className="flex flex-col gap-1">
                      <DeckCardThumb card={card} name={entry.cardId} />
                      <span className="truncate text-[11px]" title={card?.name}>
                        {card?.name ?? entry.cardId}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </SheetCard>
          )}

          <SheetCard title="Courbe de coûts" className="gap-3 p-4">
            <CostCurve cards={cards} zones={zones} cardsById={cardsById} />
          </SheetCard>
        </aside>
      </div>

      {/* Mobile : la même matière, en trois onglets. */}
      <div className="flex flex-col gap-4 lg:hidden">
        <div className="flex flex-wrap gap-2 border-b pb-3">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              aria-pressed={tab === entry.key}
              className={cn(
                "h-[34px] shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                tab === entry.key
                  ? "bg-primary text-primary-foreground"
                  : "border text-muted-foreground"
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === "description" && (
          <div className="flex flex-col gap-4">
            {descriptionCard}
            <SheetCard
              title="Contenu du deck"
              className="gap-3 p-4"
              meta={<DeckSizeLabel cards={cards} zones={zones} />}
            >
              <DeckZonesSummary cards={cards} zones={zones} />
            </SheetCard>
            {matchupsCard}
          </div>
        )}
        {tab === "guide" && guideCard}
        {tab === "cards" && cardsCard}
      </div>

      {/* Barre d'action basse : les trois gestes de la fiche, à portée de pouce. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t bg-muted/50 p-3 backdrop-blur supports-[backdrop-filter]:bg-muted/70 lg:hidden">
        <Button
          type="button"
          variant={favorited ? "default" : "outline"}
          size="icon-lg"
          className="size-11"
          aria-label={favorited ? "Retirer des favoris" : "Ajouter aux favoris"}
          onClick={toggleFavorite}
        >
          <Star className={favorited ? "fill-current" : undefined} />
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setShareOpen(true)}>
          <Share2 />
          Partager
        </Button>
        <Button asChild className="h-11 flex-[1.4] font-semibold">
          <Link href={`/decks/${deck.id}/edit`}>
            <Hammer />
            Construire
          </Link>
        </Button>
      </div>

      <ShareDeckDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        deckId={deck.id}
        deckName={deck.name}
        visibility={visibility}
        exportCode={exportCode}
        onVisibilityChangeAction={async (next) => {
          const ok = await patch({ visibility: next });
          if (ok) {
            setVisibility(next);
            toast.success("Visibilité mise à jour");
          }
        }}
      />
    </div>
  );
}
