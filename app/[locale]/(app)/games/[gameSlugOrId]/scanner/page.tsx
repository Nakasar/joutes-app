import { Button } from "@/components/ui/button.tsx";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { Link } from "@/i18n/navigation.ts";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import { GameToolHeaderSkeleton } from "@/components/games/GameToolSkeletons.tsx";
import ScannerClient from "./ScannerClient.tsx";

type GameParams = Promise<{ gameSlugOrId: string }>;

export async function generateMetadata({
  params,
}: {
  params: GameParams;
}): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.Scanner");

  if (!game) {
    return { title: t("metadata.notFoundTitle") };
  }

  return {
    title: t("metadata.title", { gameName: game.name }),
    description: t("metadata.description", { gameName: game.name }),
  };
}

/**
 * Deux frontières : l'en-tête ne dépend que du jeu, le scanner dépend en plus
 * des droits — reconnaissance assistée et vote d'errata.
 */
export default function GameScannerPage({ params }: { params: GameParams }) {
  return (
    <div className="container mx-auto p-6">
      <Suspense fallback={<GameToolHeaderSkeleton />}>
        <ScannerHeader params={params} />
      </Suspense>

      <Suspense fallback={<ScannerBodySkeleton />}>
        <ScannerBody params={params} />
      </Suspense>
    </div>
  );
}

function ScannerBodySkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="h-5 w-96 max-w-full rounded bg-muted/60" />
      <div className="h-64 rounded-xl border bg-card" />
    </div>
  );
}

async function ScannerHeader({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.Scanner");

  // Même traitement que les autres outils de jeu : une fonctionnalité désactivée
  // affiche un écran d'explication plutôt qu'un 404 sec.
  const enabled = Boolean(game?.features?.cards);

  return (
    <div className="flex flex-row flex-wrap justify-between">
      <div className="flex flex-row flex-wrap gap-4">
        <Button asChild>
          <Link href={`/games/${game?.slug ?? gameSlugOrId}`} className="text-blue-600 hover:underline">
            ← <span className={enabled ? undefined : "hidden lg:inline"}>{t("back")}</span>
          </Link>
        </Button>
        <h1 className="text-3xl font-bold mb-4">
          {enabled && game ? t("title", { gameName: game.name }) : t("notFoundTitle")}
        </h1>
      </div>
      <GameToolsNavBar gameSlug={game?.slug ?? gameSlugOrId} currentTab={"scanner"} />
    </div>
  );
}

async function ScannerBody({ params }: { params: GameParams }) {
  const { gameSlugOrId } = await params;
  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.Scanner");

  if (!game?.features?.cards) {
    return <p>{t("notFoundDescription")}</p>;
  }

  const [canUseAiScan, userCanVoteErratas] = await Promise.all([
    hasPermission("scanner:ai"),
    hasPermission("erratas:vote"),
  ]);

  return (
    <>
      <p className="mb-6 text-muted-foreground">{t("description", { gameName: game.name })}</p>

      <ScannerClient
        gameSlug={game.slug ?? gameSlugOrId}
        canUseAiScan={canUseAiScan}
        userCanVoteErratas={userCanVoteErratas}
      />
    </>
  );
}
