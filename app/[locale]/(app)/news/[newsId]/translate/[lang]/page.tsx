import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button.tsx";
import { getNewsById } from "@/lib/db/news.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { localeLabels } from "@/i18n/config.ts";
import { newsOriginalLang, parseLocale } from "@/lib/news/localize.ts";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import NewsTranslationEditor from "./NewsTranslationEditor.tsx";

type Props = { params: Promise<{ newsId: string; lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale = parseLocale(lang);
  return { title: locale ? `Traduire en ${localeLabels[locale]}` : "Traduire une actualité" };
}

/**
 * Le titre nomme la langue visée, qui vient de l'URL : il descend donc sous
 * frontière avec le reste. La porte — session puis droit de rédaction — répond
 * avant que l'éditeur n'apparaisse.
 */
export default function TranslateNewsPage({ params }: Props) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Suspense fallback={<TranslateNewsHeaderSkeleton />}>
        <TranslateNewsHeader params={params} />
      </Suspense>

      <Suspense fallback={<EditorFormSkeleton fields={2} />}>
        <TranslateNewsEditor params={params} />
      </Suspense>
    </div>
  );
}

function TranslateNewsHeaderSkeleton() {
  return (
    <div className="mb-6 animate-pulse space-y-4" aria-hidden>
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-9 w-64 rounded bg-muted" />
    </div>
  );
}

async function TranslateNewsHeader({ params }: Props) {
  const { newsId, lang } = await params;
  const locale = parseLocale(lang);

  return (
    <div className="mb-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/news/${newsId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour à l&apos;actualité
        </Link>
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">
        {locale ? `Traduire en ${localeLabels[locale]}` : "Traduire une actualité"}
      </h1>
    </div>
  );
}

async function TranslateNewsEditor({ params }: Props) {
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
    <>
      <p className="text-muted-foreground -mt-4 mb-6 truncate">{news.title}</p>

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
    </>
  );
}
