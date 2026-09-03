import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/lib/auth.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getLairsByIds, getLairsOwnedByUser } from "@/lib/db/lairs.ts";
import { getUserById } from "@/lib/db/users.ts";
import { hasEntitlement } from "@/lib/subscriptions/access.ts";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import type { Lair } from "@/lib/types/Lair";

import PosterBuilder, { type BuilderGame, type BuilderLair } from "./PosterBuilder.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Posters");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

/** Ce que l'écran a besoin de savoir d'un lieu : le nommer et le proposer. */
function toBuilderLair(lair: Lair): BuilderLair {
  return { id: lair.id, name: lair.name, address: lair.address, games: lair.games };
}

/**
 * Les lieux qu'on propose d'emblée : ceux que le visiteur suit, et ceux dont il
 * tient les clés.
 *
 * Ce sont les seuls qu'on puisse deviner. Tout le reste passe par la recherche,
 * qui interroge l'annuaire (`GET /api/lairs`) et voit ce que le visiteur a le
 * droit d'y voir — la page n'a donc pas à charger l'annuaire entier pour
 * offrir un choix.
 */
async function readMyLairs(): Promise<BuilderLair[]> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  if (!userId) {
    return [];
  }

  const user = await getUserById(userId);
  const [followed, owned] = await Promise.all([
    getLairsByIds(user?.lairs ?? []),
    getLairsOwnedByUser(userId),
  ]);

  const byId = new Map<string, Lair>();
  for (const lair of [...followed, ...owned]) {
    byId.set(lair.id, lair);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)).map(toBuilderLair);
}

async function PosterBuilderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Le pilote Mongo touche à l'horloge en lisant les lieux, ce qu'un prérendu
  // ne sait pas figer.
  await connection();

  const [t, myLairs, games, unlocked] = await Promise.all([
    getTranslations("Posters"),
    readMyLairs(),
    readAllGames(),
    hasEntitlement("sub:poster-styles"),
  ]);

  // Tous les jeux, et non ceux des seuls lieux connus : la recherche peut
  // ramener n'importe quel lieu, et l'écran doit savoir nommer ses jeux sans
  // repasser par le serveur.
  const catalogue: BuilderGame[] = games.map((game) => ({
    id: game.id,
    slug: game.slug,
    name: game.name,
    color: game.color,
  }));

  return (
    <div className="container mx-auto flex flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("description")}</p>
      </header>
      <PosterBuilder myLairs={myLairs} games={catalogue} unlocked={unlocked} />
    </div>
  );
}

export default function PostersPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense fallback={<EditorFormSkeleton />}>
      <PosterBuilderPage params={params} />
    </Suspense>
  );
}
