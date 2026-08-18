import { Button } from "@/components/ui/button";
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { auth } from "@/lib/auth";
import { getGameBySlugOrId } from "@/lib/db/games";
import { getPublicCubes } from "@/lib/db/cubes";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar";
import GameCubesClient from "./GameCubesClient";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlugOrId: string }>;
}): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await getGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.cubes");

  if (!game?.features?.cubes) {
    return {};
  }

  return {
    title: t("title", { gameName: game.name }),
    description: t("description", { gameName: game.name }),
  };
}

export default async function GameCubesPage({
  params,
}: {
  params: Promise<{ gameSlugOrId: string }>;
}) {
  const { gameSlugOrId } = await params;
  const game = await getGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.cubes");

  // Même traitement que les autres outils de jeu : une fonctionnalité désactivée
  // affiche un écran d'explication plutôt qu'un 404 sec.
  if (!game?.features?.cubes) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-row flex-wrap justify-between">
          <div className="flex flex-row flex-wrap gap-4">
            <Button asChild>
              <Link href={`/games/${gameSlugOrId}`}>
                ← <span className="hidden lg:inline">{t("back")}</span>
              </Link>
            </Button>
            <h1 className="mb-4 text-3xl font-bold">{t("notFoundTitle")}</h1>
          </div>
          <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={"cubes"} />
        </div>
        <p>{t("notFoundDescription")}</p>
      </div>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const cubes = await getPublicCubes({ gameId: game.id });

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-row flex-wrap justify-between">
        <div className="flex flex-row flex-wrap gap-4">
          <Button asChild>
            <Link href={`/games/${game.slug ?? gameSlugOrId}`}>
              ← {t("back")}
            </Link>
          </Button>
          <h1 className="mb-4 text-3xl font-bold">{t("title", { gameName: game.name })}</h1>
        </div>
        <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={"cubes"} />
      </div>
      <p className="mb-6">{t("description", { gameName: game.name })}</p>

      <GameCubesClient
        gameSlug={game.slug ?? game.id}
        cubes={cubes}
        canCreate={Boolean(session?.user?.id)}
      />
    </div>
  );
}
