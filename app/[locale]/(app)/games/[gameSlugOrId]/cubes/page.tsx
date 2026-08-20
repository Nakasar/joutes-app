import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { auth } from "@/lib/auth.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getPublicCubes } from "@/lib/db/cubes.ts";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import {
  GameToolGridSkeleton,
  GameToolHeaderSkeleton,
} from "@/components/games/GameToolSkeletons.tsx";
import GameCubesClient from "./GameCubesClient.tsx";

type GameParams = Promise<{ gameSlugOrId: string }>;

export async function generateMetadata({
  params,
}: {
  params: GameParams;
}): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.cubes");

  if (!game?.features?.cubes) {
    return {};
  }

  return {
    title: t("title", { gameName: game.name }),
    description: t("description", { gameName: game.name }),
  };
}

/**
 * Deux frontières : la tête ne dépend que du jeu, la liste des cubes dépend en
 * plus de la session — c'est elle qui décide du bouton de création.
 */
export default function GameCubesPage({ params }: { params: GameParams }) {
  return (
    <div className="container mx-auto p-6">
      <Suspense fallback={<GameToolHeaderSkeleton />}>
        <CubesHeader params={params} />
      </Suspense>

      <Suspense fallback={<GameToolGridSkeleton />}>
        <CubesContent params={params} />
      </Suspense>
    </div>
  );
}

async function CubesHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.cubes");

  // Même traitement que les autres outils de jeu : une fonctionnalité désactivée
  // affiche un écran d'explication plutôt qu'un 404 sec.
  const enabled = Boolean(game?.features?.cubes);

  return (
    <div className="flex flex-row flex-wrap justify-between">
      <div className="flex flex-row flex-wrap gap-4">
        <Button asChild>
          <Link href={`/games/${game?.slug ?? gameSlugOrId}`}>
            ← <span className={enabled ? undefined : "hidden lg:inline"}>{t("back")}</span>
          </Link>
        </Button>
        <h1 className="mb-4 text-3xl font-bold">
          {enabled && game ? t("title", { gameName: game.name }) : t("notFoundTitle")}
        </h1>
      </div>
      <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={"cubes"} />
    </div>
  );
}

async function CubesContent({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.cubes");

  if (!game?.features?.cubes) {
    return <p>{t("notFoundDescription")}</p>;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const cubes = await getPublicCubes({ gameId: game.id });

  return (
    <>
      <p className="mb-6">{t("description", { gameName: game.name })}</p>

      <GameCubesClient
        gameSlug={game.slug ?? game.id}
        cubes={cubes}
        canCreate={Boolean(session?.user?.id)}
      />
    </>
  );
}
