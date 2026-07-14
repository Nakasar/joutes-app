import type { Metadata } from 'next';
import {RiftboundDeckChecker} from "@/app/games/riftbound/deck-checker/deck-checker";
import {getTranslations} from "next-intl/server";
import {Button} from "@/components/ui/button";
import Link from "next/link";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar";
import db from "@/lib/mongodb";
import {Game} from "@/lib/types/Game";
import {notFound} from "next/navigation";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ input?: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("Games.DeckChecker");
  const { input } = await searchParams;

  // Un deck précis (via ?input=) obtient sa propre image de preview générée
  // à la volée ; sinon on garde le mockup générique (app/.../opengraph-image.tsx).
  const previewImageUrl =
    input && input.length > 10
      ? `/games/riftbound/deck-checker/preview-image?input=${encodeURIComponent(input)}`
      : undefined;

  return {
    title: `Joutes - ${t("title")}`,
    description: t("description"),
    keywords: ["deck checker", "riftbound", "légalité de deck", "vérification de deck"],
    openGraph: {
      url: `https://joutes.app/games/riftbound/deck-checker`,
      siteName: `Joutes`,
      title: `Joutes - ${t("title")}`,
      description: t("description"),
      ...(previewImageUrl ? { images: [{ url: previewImageUrl, width: 1200, height: 630 }] } : {}),
    },
    ...(previewImageUrl ? { twitter: { card: "summary_large_image" as const, images: [previewImageUrl] } } : {}),
  };
}

export default async function RiftboundDeckCheckerPage({ searchParams }: { searchParams: Promise<{ input?: string }> }) {
  const t = await getTranslations("Games.DeckChecker");

  const { input } = await searchParams;
  const game = await db.collection<Game>("games").findOne({slug: 'riftbound' });
  if (!game || !game.slug) notFound();

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-row flex-wrap justify-between">
        <div className="flex flex-row flex-wrap gap-4">
          <Button asChild>
            <Link href={`/games/riftbound`} className="text-blue-600 hover:underline">
              ← <span className="hidden lg:inline">{t("back")}</span>
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
        </div>
        <GameToolsNavBar gameSlug="riftbound" currentTab={'deckChecker'} />
      </div>

      <RiftboundDeckChecker input={input} />
    </div>
  )
}