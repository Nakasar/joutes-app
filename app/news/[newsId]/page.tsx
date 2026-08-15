import { Metadata } from "next";
import NewsArticleView, { buildNewsMetadata } from "./NewsArticleView";

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
