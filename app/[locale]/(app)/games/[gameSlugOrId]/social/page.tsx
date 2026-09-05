import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import {
  GameToolGridSkeleton,
  GameToolHeaderSkeleton,
} from "@/components/games/GameToolSkeletons.tsx";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { listGameSocialPosts, listGameSocialPostsWithHidden } from "@/lib/db/game-social-posts";
import { checkAdmin } from "@/lib/middleware/admin.ts";

import SocialPostCard from "./SocialPostCard.tsx";

type GameParams = Promise<{ gameSlugOrId: string }>;

/**
 * Le jeu, à condition qu'il republie les réseaux de son éditeur.
 *
 * Même contrat que la page des actualités : un fanion éteint referme la page
 * plutôt que de la rendre vide, pour qu'une adresse partagée ne survive pas à
 * la fonctionnalité qu'on vient d'éteindre.
 */
async function requireGameWithSocial(gameSlugOrId: string) {
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game?.features?.socialFeed) {
    notFound();
  }

  return game;
}

export async function generateMetadata({ params }: { params: GameParams }): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.social");

  if (!game?.features?.socialFeed) {
    return { title: t("metadata.notFoundTitle") };
  }

  return {
    title: t("metadata.title", { gameName: game.name }),
    description: t("metadata.description", { gameName: game.name }),
    openGraph: {
      url: `https://joutes.app/games/${gameSlugOrId}/social`,
      title: t("metadata.title", { gameName: game.name }),
      description: t("metadata.description", { gameName: game.name }),
      images: game.banner ? [game.banner] : [],
    },
  };
}

/**
 * Toutes les publications qu'un jeu conserve.
 *
 * **Pas de pagination**, et c'est à assumer : la rétention *est* la page. Un
 * jeu garde cent publications, elles tiennent en une lecture, et il n'y a donc
 * ni `searchParams` ni calcul de nombre de pages à écrire — ni à déboguer.
 *
 * Deux frontières, comme la page des actualités : l'en-tête ne dépend que du
 * jeu (lu en cache), la grille dépend en plus de la base et de la session.
 */
export default function GameSocialPage({ params }: { params: GameParams }) {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Suspense fallback={<GameToolHeaderSkeleton />}>
        <SocialHeader params={params} />
      </Suspense>

      <Suspense fallback={<GameToolGridSkeleton />}>
        <SocialGrid params={params} />
      </Suspense>
    </div>
  );
}

async function SocialHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const [game, t] = await Promise.all([
    requireGameWithSocial(gameSlugOrId),
    getTranslations("Games.social"),
  ]);

  return (
    <div className="flex flex-row flex-wrap justify-between gap-4">
      <div className="flex flex-row flex-wrap items-center gap-4">
        <Button asChild variant="outline">
          <Link href={`/games/${game.slug ?? gameSlugOrId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{t("title", { gameName: game.name })}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-4">
        <GameToolsNavBar gameSlug={game.slug ?? game.id} currentTab="social" />
      </div>
    </div>
  );
}

async function SocialGrid({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await requireGameWithSocial(gameSlugOrId);

  // Le pilote Mongo touche à l'horloge en lisant, ce qu'un prérendu ne sait pas
  // figer, et aucune frontière n'y change rien.
  await connection();

  /*
   * Le droit est lu **une fois pour la grille**, pas par vignette. Un
   * administrateur voit en plus les publications masquées, grisées, avec un
   * « Réafficher » : sans elles, le masquage serait irréversible faute de
   * savoir ce qu'on a masqué.
   */
  const canModerate = await checkAdmin();

  const [t, posts] = await Promise.all([
    getTranslations("Games.social"),
    canModerate ? listGameSocialPostsWithHidden(game.id) : listGameSocialPosts(game.id),
  ]);

  if (posts.length === 0) {
    return <div className="text-muted-foreground py-16 text-center">{t("empty")}</div>;
  }

  const gameSlug = game.slug ?? gameSlugOrId;

  return (
    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => (
        <SocialPostCard key={post.id} post={post} canModerate={canModerate} gameSlug={gameSlug} />
      ))}
    </div>
  );
}
