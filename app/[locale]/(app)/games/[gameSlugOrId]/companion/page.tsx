import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { CompanionPage, companionMetadata } from "@/components/companion/CompanionPage.tsx";
import { MtgCompanion } from "@/components/companion/MtgCompanion.tsx";
import { GameToolHeaderSkeleton } from "@/components/games/GameToolSkeletons.tsx";

type Props = { params: Promise<{ locale: string; gameSlugOrId: string }> };

/**
 * Riftbound et SWU ont leur dossier à eux (`games/riftbound`, `games/swu`) :
 * cette route ne sert que les jeux sans dossier, Magic pour l'instant.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, gameSlugOrId } = await params;
  setRequestLocale(locale);
  if (gameSlugOrId !== "mtg") return {};
  return companionMetadata("mtg", "Magic: The Gathering");
}

export default function GameCompanionPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="container mx-auto p-6"><GameToolHeaderSkeleton /></div>}>
      <GameCompanion params={params} />
    </Suspense>
  );
}

async function GameCompanion({ params }: Props) {
  const { locale, gameSlugOrId } = await params;
  setRequestLocale(locale);
  if (gameSlugOrId !== "mtg") notFound();
  return (
    <CompanionPage game="mtg" gameName="Magic: The Gathering">
      <MtgCompanion />
    </CompanionPage>
  );
}
