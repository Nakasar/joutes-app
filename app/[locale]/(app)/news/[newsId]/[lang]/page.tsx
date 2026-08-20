import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import NewsArticleView, { buildNewsMetadata } from "../NewsArticleView.tsx";
import { parseLocale } from "@/lib/news/localize.ts";
import { ArticleSkeleton } from "@/components/ArticleSkeleton.tsx";

type Props = { params: Promise<{ newsId: string; lang: string }> };

/**
 * L'actualité dans une langue précise.
 *
 * Les segments fixes voisins — `edit`, `translate` — l'emportent sur ce segment
 * dynamique dans le routage de Next ; `parseLocale` sert de second filet, et
 * répond 404 pour tout ce qui n'est pas une langue de l'application. Une langue
 * valide mais absente de l'actualité est refusée de la même façon, dans
 * `NewsArticleView` : une adresse servie porte toujours la langue qu'elle
 * annonce.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { newsId, lang } = await params;
  const locale = parseLocale(lang);
  if (!locale) return { title: "Actualité introuvable" };

  return buildNewsMetadata(newsId, locale);
}

/**
 * Une seule frontière, comme `/news/:newsId` : tout vient de l'actualité et de
 * la session.
 */
export default function NewsDetailInLanguagePage({ params }: Props) {
  return (
    <Suspense fallback={<NewsArticleFallback />}>
      <NewsArticleInLanguage params={params} />
    </Suspense>
  );
}

function NewsArticleFallback() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <ArticleSkeleton />
    </div>
  );
}

async function NewsArticleInLanguage({ params }: Props) {
  const { newsId, lang } = await params;

  const locale = parseLocale(lang);
  if (!locale) {
    notFound();
  }

  return <NewsArticleView newsId={newsId} requestedLang={locale} />;
}
