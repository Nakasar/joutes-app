import Link from "next/link";
import Image from "next/image";
import { DateTime } from "luxon";
import { getLocale, getTranslations } from "next-intl/server";
import { News } from "@/lib/types/News";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LikeButton from "@/app/news/[newsId]/LikeButton";

type NewsCardProps = {
  news: News;
  isLoggedIn: boolean;
  compact?: boolean;
};

export default async function NewsCard({ news, isLoggedIn, compact = false }: NewsCardProps) {
  const t = await getTranslations("Games.news");
  const locale = await getLocale();
  const date = DateTime.fromJSDate(new Date(news.createdAt))
    .setLocale(locale)
    .toLocaleString(DateTime.DATE_FULL);
  const authorName =
    news.author?.displayName && news.author?.discriminator
      ? `${news.author.displayName}#${news.author.discriminator}`
      : t("unknownAuthor");

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      {news.banner && (
        <div className="relative w-full aspect-[3/1] max-h-48">
          <Image
            src={news.banner}
            alt={news.title}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <CardHeader className="pb-2">
        <Link href={`/news/${news.id}`} className="group">
          <CardTitle className="text-xl group-hover:text-primary transition-colors">
            {news.title}
          </CardTitle>
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{date}</span>
          <span>·</span>
          <span>{authorName}</span>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className={`text-muted-foreground ${compact ? "line-clamp-2" : "line-clamp-3"}`}>
          {news.summary}
        </p>

        {!compact && news.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {news.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-0">
        <Button asChild variant="link" className="p-0 h-auto">
          <Link href={`/news/${news.id}`}>{t("readMore")}</Link>
        </Button>

        <LikeButton
          newsId={news.id}
          initialLiked={news.userHasLiked ?? false}
          initialCount={news.likesCount}
          isLoggedIn={isLoggedIn}
        />
      </CardFooter>
    </Card>
  );
}
