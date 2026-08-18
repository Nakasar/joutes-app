import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { News } from "@/lib/types/News";
import { Button } from "@/components/ui/button";
import NewsCard from "./news/NewsCard";

type GameNewsSectionProps = {
  news: News[];
  gameSlug: string;
  isLoggedIn: boolean;
};

export async function GameNewsSection({ news, gameSlug, isLoggedIn }: GameNewsSectionProps) {
  if (news.length === 0) {
    return null;
  }

  const t = await getTranslations("Games");

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-white">{t("detail.news.title")}</h2>
        <Button asChild variant="secondary">
          <Link href={`/games/${gameSlug}/news`}>{t("detail.news.viewAll")}</Link>
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {news.map((item) => (
          <NewsCard key={item.id} news={item} isLoggedIn={isLoggedIn} compact />
        ))}
      </div>
    </section>
  );
}
