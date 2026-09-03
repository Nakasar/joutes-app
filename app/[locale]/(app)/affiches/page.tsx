import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/lib/auth.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getLairsByIds, getLairsOwnedByUser } from "@/lib/db/lairs.ts";
import { getPostersByUser } from "@/lib/db/posters.ts";
import { visibleLairsAmong } from "@/lib/lairs/visible.ts";
import { getUserById } from "@/lib/db/users.ts";
import { hasEntitlement } from "@/lib/subscriptions/access.ts";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import type { Lair } from "@/lib/types/Lair";

import PosterBuilder, { type BuilderGame, type BuilderLair, type BuilderPoster } from "./PosterBuilder.tsx";

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
 * Le compte connecté, lu une fois pour la page.
 *
 * Deux lectures en ont besoin — les lieux et les affiches gardées — et elles
 * partent en parallèle : sans `cache`, la session serait relue deux fois.
 */
const readUserId = cache(async (): Promise<string | null> => {
  const session = await auth.api.getSession({ headers: await headers() });

  return session?.user?.id ?? null;
});

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
  const userId = await readUserId();

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

/**
 * Les affiches que le visiteur a gardées, ou `null` s'il n'est pas connecté.
 *
 * `null` et non un tableau vide : « aucune affiche gardée » et « on ne sait pas
 * qui vous êtes » n'appellent pas le même écran — le premier propose d'en
 * garder une, le second de se connecter.
 */
async function readMyPosters(): Promise<BuilderPoster[] | null> {
  const userId = await readUserId();

  if (!userId) {
    return null;
  }

  const posters = await getPostersByUser(userId);

  // Les lieux sont résolus ici, une fois pour toutes les affiches, et passés
  // entiers plutôt que par identifiants : l'écran a besoin de leur nom pour les
  // montrer et de leurs jeux pour proposer un filtre, et il ne peut pas les
  // deviner — une affiche peut porter un lieu que le visiteur ne suit pas,
  // trouvé jadis par la recherche.
  //
  // `visibleLairsAmong` porte la même règle que l'affiche : un lieu devenu
  // privé depuis l'enregistrement disparaît de l'affiche **et** de sa fiche,
  // plutôt que d'y laisser un nom qu'on n'a plus le droit de lire.
  const lairs = await visibleLairsAmong(...new Set(posters.flatMap((poster) => poster.lairIds)));
  const byId = new Map(lairs.map((lair) => [lair.id, toBuilderLair(lair)]));

  return posters.map((poster) => ({
    id: poster.id,
    name: poster.name,
    lairs: poster.lairIds.map((id) => byId.get(id)).filter((lair): lair is BuilderLair => lair !== undefined),
    gameIds: poster.gameIds,
    period: poster.period,
    style: poster.style,
    showAttendance: poster.showAttendance,
    gameLogos: poster.gameLogos,
  }));
}

async function PosterBuilderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Le pilote Mongo touche à l'horloge en lisant les lieux, ce qu'un prérendu
  // ne sait pas figer.
  await connection();

  const [t, myLairs, games, unlocked, library, saved] = await Promise.all([
    getTranslations("Posters"),
    readMyLairs(),
    readAllGames(),
    hasEntitlement("sub:poster-styles"),
    hasEntitlement("sub:poster-library"),
    readMyPosters(),
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
      <PosterBuilder
        myLairs={myLairs}
        games={catalogue}
        unlocked={unlocked}
        saved={saved}
        unlimited={library}
      />
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
