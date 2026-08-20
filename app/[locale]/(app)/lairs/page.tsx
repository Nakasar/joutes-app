import { searchLairs } from "@/lib/db/lairs.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Metadata } from "next";
import { Suspense } from "react";
import { MapPin } from "lucide-react";
import CreatePrivateLairButton from "./CreatePrivateLairButton.tsx";
import LairsClient from "./LairsClient.tsx";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentListSkeleton } from "@/components/ContentListSkeleton.tsx";

type SearchParams = Promise<{ gameId?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Lairs");

  return {
    title: t("page.title"),
    description: t("page.description"),
    keywords: ["lairs", "boutiques de jeux", "magasins de jeux", "local game stores", "événements locaux", "jeux de cartes à collectionner"],
    openGraph: {
      title: `${t("page.title")} - Joutes`,
      description: t("page.description"),
    },
  };
}

/**
 * Le titre et l'accroche ne dépendent que de la langue : ils restent dans la
 * coquille. Cette route n'a pas de segment dynamique, donc pas de coquille de
 * repli partagée — ce qui est en dehors des frontières est réellement prérendu.
 */
export default async function LairsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Lairs");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
              <MapPin className="h-8 w-8 text-primary" />
              {t("page.title")}
            </h1>
            <p className="text-xl text-muted-foreground">
              {t("page.description")}
            </p>
          </div>
          {/* Pas de silhouette : ce bouton ne s'affiche qu'aux comptes
              connectés, et lui réserver sa place la ferait sauter aux autres. */}
          <Suspense fallback={null}>
            <PrivateLairButton />
          </Suspense>
        </div>

        <Suspense fallback={<ContentListSkeleton />}>
          <LairsList searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function PrivateLairButton() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  return <CreatePrivateLairButton />;
}

async function LairsList({ searchParams }: { searchParams: SearchParams }) {
  // Le pilote Mongo touche à l'horloge en cherchant les lairs, ce qu'un
  // prérendu ne sait pas figer. Aucune frontière n'y change rien : c'est de la
  // sync-IO, pas une donnée de requête.
  await connection();

  // La session sert à faire apparaître ses propres lairs privés dans la liste.
  const session = await auth.api.getSession({ headers: await headers() });
  const { gameId } = await searchParams;

  const [initialLairsData, games] = await Promise.all([
    searchLairs({
      gameIds: gameId ? [gameId] : undefined,
      userId: session?.user?.id,
      page: 1,
      limit: 10,
    }),
    readAllGames(),
  ]);

  return <LairsClient initialData={initialLairsData} games={games} initialFilters={{ gameId }} />;
}
