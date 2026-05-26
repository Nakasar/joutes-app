import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { hasPermission } from "@/lib/db/permissions";
import { getNewsById, getAllTags } from "@/lib/db/news";
import { getAllGames } from "@/lib/db/games";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import NewsForm from "../../NewsForm";

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

  const [news, games, existingTags] = await Promise.all([
    getNewsById(newsId),
    getAllGames(),
    getAllTags(),
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

      <NewsForm mode="edit" news={news} games={games} existingTags={existingTags} />
    </div>
  );
}
