import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getNewsById } from "@/lib/db/news";
import { hasPermission } from "@/lib/db/permissions";
import { Metadata } from "next";
import { DateTime } from "luxon";
import Link from "next/link";
import { ArrowLeft, Pencil, Tag, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import LikeButton from "./LikeButton";
import NewsContent from "./NewsContent";

type Props = { params: Promise<{ newsId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { newsId } = await params;
  const news = await getNewsById(newsId);
  if (!news) return { title: "Actualité introuvable" };
  return {
    title: news.title,
    description: news.summary,
    openGraph: {
      title: news.title,
      description: news.summary,
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { newsId } = await params;

  const [session, news, canWrite] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getNewsById(newsId),
    hasPermission("news:update").catch(() => false),
  ]);

  if (!news) {
    notFound();
  }

  const date = DateTime.fromJSDate(new Date(news.createdAt))
    .setLocale("fr")
    .toLocaleString(DateTime.DATE_FULL);

  const authorName =
    news.author?.displayName && news.author?.discriminator
      ? `${news.author.displayName}#${news.author.discriminator}`
      : "Auteur inconnu";

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/news">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux actualités
          </Link>
        </Button>
        {canWrite && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/news/${newsId}/edit`}>
              <Pencil className="h-4 w-4 mr-2" />
              Modifier
            </Link>
          </Button>
        )}
      </div>

      {/* En-tête */}
      <article className="space-y-6">
        {/* Bannière */}
        {news.banner && (
          <div className="relative w-full rounded-xl overflow-hidden aspect-[3/1] max-h-64">
            <Image
              src={news.banner}
              alt={`Bannière : ${news.title}`}
              fill
              className="object-cover"
              unoptimized
              priority
            />
          </div>
        )}

        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">{news.title}</h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{date}</span>
            <span>·</span>
            <span>Par {authorName}</span>
          </div>

          {/* Résumé */}
          <p className="text-lg text-muted-foreground border-l-4 border-primary pl-4">
            {news.summary}
          </p>

          {/* Jeux et tags */}
          {(news.games?.length || news.tags.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {news.games?.map((g) => (
                <Badge key={g.id} variant="secondary" className="gap-1">
                  <Gamepad2 className="h-3 w-3" />
                  {g.name}
                </Badge>
              ))}
              {news.tags.map((t) => (
                <Badge key={t} variant="outline" className="gap-1">
                  <Tag className="h-3 w-3" />
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </header>

        {/* Contenu markdown */}
        <NewsContent content={news.content} />

        {/* Like */}
        <footer className="pt-6 border-t flex items-center justify-between">
          <LikeButton
            newsId={news.id}
            initialLiked={news.userHasLiked ?? false}
            initialCount={news.likesCount}
            isLoggedIn={!!session?.user}
          />
        </footer>
      </article>
    </div>
  );
}
