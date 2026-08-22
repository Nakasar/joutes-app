import { Suspense } from "react";
import { headers } from "next/headers";
import { Metadata } from "next";
import { Library, Plus } from "lucide-react";

import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { auth } from "@/lib/auth.ts";
import { getDeckLegendFacets, getFeaturedDecks, searchDecks } from "@/lib/db/decks.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getDeckCardInfos } from "@/lib/db/deck-cards.ts";
import { librarySortOptions, parseLibraryParams } from "@/lib/decks/library-filters.ts";
import { DeckLibraryClient } from "./DeckLibraryClient.tsx";
import { FeaturedDecks } from "./FeaturedDecks.tsx";

export const metadata: Metadata = {
  title: "Librairie de decks",
  description:
    "Parcourez les decks publiés par la communauté : filtrez par jeu, format, légende et domaines, puis copiez la liste dans vos decks.",
  keywords: ["decks", "librairie", "listes publiées", "jeux de cartes à collectionner", "archétypes"],
  openGraph: {
    title: "Librairie de decks - Joutes",
    description: "Les listes publiées par la communauté.",
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function DeckLibraryContent({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    searchParams,
  ]);

  const filters = parseLibraryParams(params);
  const { sortBy, favoritesOnly } = librarySortOptions(filters.sort);

  const [games, initialData, legends, featured] = await Promise.all([
    getAllGames(),
    searchDecks({
      scope: "public",
      gameId: filters.gameId !== "all" ? filters.gameId : undefined,
      format: filters.format !== "all" ? filters.format : undefined,
      legendCardId: filters.legendCardId || undefined,
      domains: filters.domains.length > 0 ? filters.domains : undefined,
      search: filters.search || undefined,
      sortBy,
      sortOrder: "desc",
      favoritesOnly: favoritesOnly || filters.favoritesOnly,
      viewerId: session?.user?.id,
      page: 1,
      limit: 20,
    }),
    getDeckLegendFacets(filters.gameId !== "all" ? filters.gameId : undefined),
    getFeaturedDecks(filters.gameId !== "all" ? filters.gameId : undefined),
  ]);

  // Les domaines proposés en filtre sont ceux que portent réellement les decks
  // publiés : une facette qui ne rend jamais rien n'est pas un filtre.
  const domainValues = [
    ...new Set([...initialData.decks, ...featured].flatMap((deck) => deck.domains ?? [])),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  // Les bandeaux de la rangée mise en avant : une requête pour les trois
  // légendes, pas une par carte.
  const legendCardsByGame = await Promise.all(
    [...new Set(featured.map((deck) => deck.gameId))].map(async (gameId) => {
      const ids = featured
        .filter((deck) => deck.gameId === gameId && deck.legendCardId)
        .map((deck) => deck.legendCardId as string);
      return getDeckCardInfos(gameId, ids);
    })
  );
  const legendCards = new Map(legendCardsByGame.flat().map((card) => [card.id, card]));

  return (
    <div className="container mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-4xl font-bold tracking-tight">
            <Library className="size-8 text-primary" />
            Librairie de decks
          </h1>
          <p className="text-xl text-muted-foreground">Les listes publiées par la communauté</p>
        </div>
        <Button asChild>
          <Link href="/decks">
            <Plus />
            Nouveau deck
          </Link>
        </Button>
      </header>

      <FeaturedDecks decks={featured} legendCards={legendCards} />

      <DeckLibraryClient
        initialData={initialData}
        initialFilters={filters}
        games={games}
        legends={legends}
        domainValues={domainValues}
        currentUserId={session?.user?.id}
      />
    </div>
  );
}

/**
 * La librairie est publique : elle se rend pour un visiteur non connecté comme
 * pour un membre. La coquille ne tient donc que la silhouette des résultats, le
 * temps que la base réponde.
 */
export default function DeckLibraryPage(props: Parameters<typeof DeckLibraryContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <CollectionSkeleton tiles={6} label="Chargement de la librairie" />
        </div>
      }
    >
      <DeckLibraryContent {...props} />
    </Suspense>
  );
}
