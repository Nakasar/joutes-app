import { Suspense } from "react";
import { CollectionSkeleton } from "@/components/CollectionSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";
import { getBooster } from "@/lib/db/boosters.ts";
import BoosterEditor from "./BoosterEditor.tsx";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSlug: string; boosterId: string }>;
}): Promise<Metadata> {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { gameSlug } = await params;
  const t = await getTranslations("Collection");
  const game = await readGameBySlugOrId(gameSlug);
  return { title: game ? t("boosters.metadataTitle", { game: game.name }) : t("boosters.title") };
}

async function BoosterEditorPageContent({
  params,
}: {
  params: Promise<{ gameSlug: string; boosterId: string }>;
}) {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer, et aucune frontière n'y change rien.
  await connection();
  const { gameSlug, boosterId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const game = await readGameBySlugOrId(gameSlug);
  if (!game) {
    notFound();
  }

  const booster = await getBooster(boosterId);
  if (!booster || booster.userId !== session.user.id || booster.gameId !== game.id) {
    notFound();
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <BoosterEditor gameSlug={game.slug ?? game.id} gameName={game.name} initialBooster={booster} />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function BoosterEditorPage(props: Parameters<typeof BoosterEditorPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <CollectionSkeleton tiles={6} label="Chargement du booster" />
        </div>
      }
    >
      <BoosterEditorPageContent {...props} />
    </Suspense>
  );
}
