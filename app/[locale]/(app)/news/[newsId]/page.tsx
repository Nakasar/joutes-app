import { Metadata } from "next";
import { Suspense } from "react";
import NewsArticleView, { buildNewsMetadata } from "./NewsArticleView.tsx";
import { ArticleSkeleton } from "@/components/ArticleSkeleton.tsx";

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

/**
 * Une seule frontière : tout ce que cette page affiche vient de l'actualité et
 * de la session — il n'y a rien à en sortir qui tiendrait dans une coquille.
 */
export default function NewsDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<NewsArticleFallback />}>
      <NewsArticle params={params} />
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

async function NewsArticle({ params }: Props) {
  const { newsId } = await params;
  return <NewsArticleView newsId={newsId} />;
}
