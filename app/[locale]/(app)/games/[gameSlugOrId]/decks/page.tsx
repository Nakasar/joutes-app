import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getDeckLegendFacets, searchDecks } from "@/lib/db/decks.ts";
import { librarySortOptions, parseLibraryParams } from "@/lib/decks/library-filters.ts";
import { DeckLibraryClient } from "@/components/decks/DeckLibraryClient.tsx";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import {
  GameToolGridSkeleton,
  GameToolHeaderSkeleton,
} from "@/components/games/GameToolSkeletons.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { GameDeckCreateButton } from "./GameDeckCreateButton.tsx";

type GameParams = Promise<{ gameSlugOrId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface GameDecksPageProps {
  params: GameParams;
  searchParams: SearchParams;
}

/**
 * Le jeu, à condition qu'il ouvre ses decks.
 *
 * Le fanion se pose depuis l'administration : sans lui, ni explorateur ni
 * éditeur pour ce jeu, et l'adresse répond 404 plutôt que de montrer une page
 * que la fiche du jeu ne propose plus.
 */
async function requireGameWithDecks(gameSlugOrId: string) {
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game?.features?.decks) {
    notFound();
  }

  return game;
}

export async function generateMetadata({ params }: GameDecksPageProps): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.decks");

  if (!game?.features?.decks) {
    return { title: t("metadata.notFoundTitle") };
  }

  const title = t("metadata.title", { gameName: game.name });
  const description = t("metadata.description", { gameName: game.name });

  return {
    title,
    description,
    openGraph: {
      url: `https://joutes.app/games/${gameSlugOrId}/decks`,
      title,
      description,
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * L'explorateur de decks d'un jeu.
 *
 * La liste est celle de la librairie (`components/decks/DeckLibraryClient`),
 * avec le jeu imposé : filtres, facettes et pagination sont déjà écrits, et
 * deux listes de decks qui divergeraient finiraient par ne plus se ressembler.
 * Ce que la page ajoute, c'est l'entrée dans l'éditeur pour ce jeu.
 *
 * Deux frontières : l'en-tête ne dépend que du jeu, la liste dépend en plus de
 * la session et des filtres demandés.
 */
export default function GameDecksPage({ params, searchParams }: GameDecksPageProps) {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Suspense fallback={<GameToolHeaderSkeleton />}>
        <DecksHeader params={params} />
      </Suspense>

      <Suspense fallback={<GameToolGridSkeleton cards={6} />}>
        <DecksExplorer params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DecksHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await requireGameWithDecks(gameSlugOrId);
  const t = await getTranslations("Games.decks");

  return (
    <div className="flex flex-row flex-wrap justify-between gap-4">
      <div className="flex flex-row flex-wrap items-center gap-4">
        <Button asChild variant="outline">
          <Link href={`/games/${game.slug ?? gameSlugOrId}`}>← {t("back")}</Link>
        </Button>
        <h1 className="text-3xl font-bold">{t("title", { gameName: game.name })}</h1>
      </div>
      <GameToolsNavBar gameSlug={game.slug ?? game.id} currentTab="decks" />
    </div>
  );
}

async function DecksExplorer({ params, searchParams }: GameDecksPageProps) {
  const { gameSlugOrId } = await params;
  const game = await requireGameWithDecks(gameSlugOrId);

  const [session, rawParams, t] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    searchParams,
    getTranslations("Games.decks"),
  ]);

  // Le jeu vient du chemin, pas de la requête : un `?gameId=` collé à la main
  // ne doit pas ouvrir les decks d'un autre jeu sous le titre de celui-ci.
  const filters = { ...parseLibraryParams(rawParams), gameId: game.id };
  const { sortBy, favoritesOnly } = librarySortOptions(filters.sort);

  const [initialData, legends] = await Promise.all([
    searchDecks({
      scope: "public",
      gameId: game.id,
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
    getDeckLegendFacets(game.id),
  ]);

  // Les domaines proposés en filtre sont ceux que portent réellement les decks
  // publiés de ce jeu : une facette qui ne rend jamais rien n'est pas un filtre.
  const domainValues = [
    ...new Set(initialData.decks.flatMap((deck) => deck.domains ?? [])),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground">{t("description", { gameName: game.name })}</p>
        <GameDeckCreateButton
          game={game}
          isLoggedIn={Boolean(session?.user?.id)}
          label={t("create")}
          signInLabel={t("signInToCreate")}
        />
      </div>

      <DeckLibraryClient
        initialData={initialData}
        initialFilters={filters}
        games={[game]}
        legends={legends}
        domainValues={domainValues}
        currentUserId={session?.user?.id}
        lockedGameId={game.id}
      />
    </div>
  );
}
