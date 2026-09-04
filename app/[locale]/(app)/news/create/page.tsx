import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getLocale, setRequestLocale } from "next-intl/server";
import { hasPermission } from "@/lib/db/permissions.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getAllTags } from "@/lib/db/news.ts";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import NewsForm from "../NewsForm.tsx";
import { Locale } from "@/i18n/config.ts";

export const metadata: Metadata = {
  title: "Rédiger une actualité",
  description: "Créer une nouvelle actualité",
};

/**
 * L'en-tête ne dit rien que l'onglet ne dise déjà : il reste dans la coquille.
 * La porte — session puis droit de rédaction — et le formulaire qu'elle ouvre
 * sont derrière la frontière.
 */
interface CreateNewsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ gameId?: string }>;
}

export default async function CreateNewsPage({ params, searchParams }: CreateNewsPageProps) {
  // Le bouton de retour est un `Link` localisé, resté dans la coquille : sans
  // cet appel, next-intl relit la langue à la requête pour en composer l'adresse
  // et rend toute la route dynamique. L'appel du layout ne porte pas jusqu'ici —
  // layout et page rendent chacun de leur côté.
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/news">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux actualités
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Rédiger une actualité</h1>
        <p className="text-muted-foreground mt-1">
          Créez une nouvelle actualité pour la communauté
        </p>
      </div>

      <Suspense fallback={<EditorFormSkeleton />}>
        <CreateNewsForm searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CreateNewsForm({ searchParams }: { searchParams: CreateNewsPageProps["searchParams"] }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const canWrite = await hasPermission("news:update").catch(() => false);
  if (!canWrite) {
    redirect("/news");
  }

  const [games, existingTags, locale, { gameId }] = await Promise.all([
    readAllGames(),
    getAllTags(),
    getLocale(),
    searchParams,
  ]);

  // On arrive parfois depuis la page d'actualités d'un jeu, qui le désigne dans
  // l'adresse : le rattachement est alors déjà coché. Un identifiant inconnu —
  // collé à la main, ou d'un jeu retiré depuis — est ignoré plutôt que de poser
  // dans le formulaire un jeu que la liste ne propose pas.
  const defaultGameIds = games.some((game) => game.id === gameId) ? [gameId as string] : [];

  return (
    <NewsForm
      mode="create"
      games={games}
      defaultGameIds={defaultGameIds}
      existingTags={existingTags}
      defaultLang={locale as Locale}
    />
  );
}
