import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale } from "next-intl/server";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getNewsById, getAllTags } from "@/lib/db/news.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import NewsForm from "../../NewsForm.tsx";
import { Locale } from "@/i18n/config.ts";

type Props = { params: Promise<{ newsId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { newsId } = await params;

  // Même piège Mongo que dans le corps, à désarmer une seconde fois : les
  // métadonnées s'exécutent hors de la frontière de la page.
  await connection();
  const news = await getNewsById(newsId);
  return {
    title: news ? `Modifier : ${news.title}` : "Modifier une actualité",
  };
}

/**
 * Le titre de l'actualité descend avec le formulaire plutôt que de rester dans
 * l'en-tête : c'est la seule chose ici qui demande une lecture, et la porte doit
 * répondre avant qu'on l'affiche.
 */
export default function EditNewsPage({ params }: Props) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Suspense fallback={<BackToNewsSkeleton />}>
          <BackToNews params={params} />
        </Suspense>
        <h1 className="text-3xl font-bold tracking-tight">Modifier l&apos;actualité</h1>
      </div>

      <Suspense fallback={<EditorFormSkeleton />}>
        <EditNewsForm params={params} />
      </Suspense>
    </div>
  );
}

function BackToNewsSkeleton() {
  return <div className="mb-4 h-8 w-48 animate-pulse rounded-md bg-muted" aria-hidden />;
}

async function BackToNews({ params }: Props) {
  const { newsId } = await params;

  return (
    <Button asChild variant="ghost" size="sm" className="mb-4">
      <Link href={`/news/${newsId}`}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour à l&apos;actualité
      </Link>
    </Button>
  );
}

async function EditNewsForm({ params }: Props) {
  const { newsId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const canWrite = await hasPermission("news:update").catch(() => false);
  if (!canWrite) {
    redirect(`/news/${newsId}`);
  }

  const [news, games, existingTags, locale] = await Promise.all([
    getNewsById(newsId),
    readAllGames(),
    getAllTags(),
    getLocale(),
  ]);

  if (!news) {
    notFound();
  }

  return (
    <>
      <p className="text-muted-foreground mt-1 mb-6 truncate">{news.title}</p>
      <NewsForm mode="edit" news={news} games={games} existingTags={existingTags} defaultLang={locale as Locale} />
    </>
  );
}
