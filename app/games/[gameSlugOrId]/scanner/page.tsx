import { Button } from "@/components/ui/button";
import { getGameBySlugOrId } from "@/lib/db/games";
import { hasPermission } from "@/lib/db/permissions";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar";
import ScannerClient from "./ScannerClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlugOrId: string }>;
}): Promise<Metadata> {
  const { gameSlugOrId } = await params;
  const game = await getGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.Scanner");

  if (!game) {
    return { title: t("metadata.notFoundTitle") };
  }

  return {
    title: t("metadata.title", { gameName: game.name }),
    description: t("metadata.description", { gameName: game.name }),
  };
}

export default async function GameScannerPage({ params }: { params: Promise<{ gameSlugOrId: string }> }) {
  const { gameSlugOrId } = await params;

  const game = await getGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games.Scanner");
  const canUseAiScan = await hasPermission("scanner:ai");
  const userCanVoteErratas = await hasPermission("erratas:vote");

  if (!game?.features?.cards) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-row flex-wrap justify-between">
          <div className="flex flex-row flex-wrap gap-4">
            <Button asChild>
              <Link href={`/games/${gameSlugOrId}`} className="text-blue-600 hover:underline">
                ← <span className="hidden lg:inline">{t("back")}</span>
              </Link>
            </Button>
            <h1 className="text-3xl font-bold mb-4">{t("notFoundTitle")}</h1>
          </div>
          <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={"scanner"} />
        </div>
        <p>{t("notFoundDescription")}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-row flex-wrap justify-between">
        <div className="flex flex-row flex-wrap gap-4">
          <Button asChild>
            <Link href={`/games/${game.slug}`} className="text-blue-600 hover:underline">
              ← {t("back")}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-4">{t("title", { gameName: game.name })}</h1>
        </div>
        <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={"scanner"} />
      </div>
      <p className="mb-6 text-muted-foreground">{t("description", { gameName: game.name })}</p>

      <ScannerClient
        gameSlug={game.slug ?? gameSlugOrId}
        canUseAiScan={canUseAiScan}
        userCanVoteErratas={userCanVoteErratas}
      />
    </div>
  );
}
