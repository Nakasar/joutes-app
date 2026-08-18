import { Metadata } from "next";
import { notFound } from "next/navigation";
import NewsArticleView, { buildNewsMetadata } from "../NewsArticleView";
import { parseLocale } from "@/lib/news/localize";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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

export default async function NewsDetailInLanguagePage({ params }: Props) {
  const { newsId, lang } = await params;

  const locale = parseLocale(lang);
  if (!locale) {
    notFound();
  }

  return <NewsArticleView newsId={newsId} requestedLang={locale} />;
}
