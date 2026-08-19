import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getNewsById, getAllTags } from "@/lib/db/news.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import NewsForm from "../../NewsForm.tsx";
import { Locale } from "@/i18n/config.ts";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type Props = { params: Promise<{ newsId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { newsId } = await params;
  const news = await getNewsById(newsId);
  return {
    title: news ? `Modifier : ${news.title}` : "Modifier une actualité",
  };
}

export default async function EditNewsPage({ params }: Props) {
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
    getAllGames(),
    getAllTags(),
    getLocale(),
  ]);

  if (!news) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={`/news/${newsId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à l&apos;actualité
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Modifier l&apos;actualité</h1>
        <p className="text-muted-foreground mt-1 truncate">{news.title}</p>
      </div>

      <NewsForm mode="edit" news={news} games={games} existingTags={existingTags} defaultLang={locale as Locale} />
    </div>
  );
}
