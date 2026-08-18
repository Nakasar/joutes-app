import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { getNewsById } from "@/lib/db/news";
import { hasPermission } from "@/lib/db/permissions";
import { localeLabels } from "@/i18n/config";
import { newsOriginalLang, parseLocale } from "@/lib/news/localize";
import NewsTranslationEditor from "./NewsTranslationEditor";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type Props = { params: Promise<{ newsId: string; lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale = parseLocale(lang);
  return { title: locale ? `Traduire en ${localeLabels[locale]}` : "Traduire une actualité" };
}

export default async function TranslateNewsPage({ params }: Props) {
  const { newsId, lang } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const locale = parseLocale(lang);
  if (!locale) {
    notFound();
  }

  const news = await getNewsById(newsId);
  if (!news) {
    notFound();
  }

  // Traduire, c'est modifier ce que le visiteur lit : même droit que rédiger.
  const canWrite = await hasPermission("news:update").catch(() => false);
  if (!canWrite) {
    redirect(`/news/${newsId}`);
  }

  // Traduire une actualité vers sa propre langue n'a pas de sens : on renvoie
  // vers l'actualité plutôt que d'ouvrir un éditeur qui ne mènerait à rien.
  const originalLang = newsOriginalLang(news);
  if (locale === originalLang) {
    redirect(`/news/${newsId}`);
  }

  const existing = news.translations?.find((translation) => translation.lang === locale);

  // Un seul jeu rattaché désigne le catalogue de cartes que l'import d'une
  // traduction interrogera, comme pour la rédaction.
  const importGameId = news.gameIds.length === 1 ? news.gameIds[0] : undefined;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={`/news/${newsId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à l&apos;actualité
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Traduire en {localeLabels[locale]}</h1>
        <p className="text-muted-foreground mt-1 truncate">{news.title}</p>
      </div>

      <NewsTranslationEditor
        newsId={newsId}
        lang={locale}
        originalLang={originalLang}
        original={{ title: news.title, summary: news.summary, content: news.content }}
        initial={{
          title: existing?.title ?? "",
          summary: existing?.summary ?? "",
          content: existing?.content ?? "",
        }}
        hasExisting={!!existing}
        importGameId={importGameId}
      />
    </div>
  );
}
