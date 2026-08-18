import { Metadata } from "next";
import NewsArticleView, { buildNewsMetadata } from "./NewsArticleView";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type Props = { params: Promise<{ newsId: string }> };

/**
 * L'actualité dans la langue de l'interface du lecteur, ou à défaut dans sa
 * version originale. Les autres langues ont leur propre adresse,
 * `/news/:newsId/:lang`.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { newsId } = await params;
  return buildNewsMetadata(newsId);
}

export default async function NewsDetailPage({ params }: Props) {
  const { newsId } = await params;
  return <NewsArticleView newsId={newsId} />;
}
