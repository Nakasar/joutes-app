import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation.ts";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button.tsx";
import { getQuizById } from "@/lib/db/quizzes.ts";
import { canManageQuiz } from "@/lib/quizzes/authorization.ts";
import { locales, localeLabels, type Locale } from "@/i18n/config.ts";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import QuizTranslationEditor from "./QuizTranslationEditor.tsx";

type Props = { params: Promise<{ quizId: string; lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale = (locales as readonly string[]).includes(lang) ? (lang as Locale) : undefined;
  return { title: locale ? `Traduire en ${localeLabels[locale]}` : "Traduire un quizz" };
}

/**
 * Le titre nomme la langue visée, qui vient de l'URL : il descend donc sous
 * frontière avec le reste. La porte — auteur ou modération — répond avant que
 * l'éditeur n'apparaisse.
 */
export default function TranslateQuizPage({ params }: Props) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Suspense fallback={<TranslateQuizHeaderSkeleton />}>
        <TranslateQuizHeader params={params} />
      </Suspense>

      <Suspense fallback={<EditorFormSkeleton fields={2} />}>
        <TranslateQuizEditor params={params} />
      </Suspense>
    </div>
  );
}

function TranslateQuizHeaderSkeleton() {
  return (
    <div className="mb-6 animate-pulse space-y-4" aria-hidden>
      <div className="h-8 w-40 rounded-md bg-muted" />
      <div className="h-9 w-64 rounded bg-muted" />
    </div>
  );
}

async function TranslateQuizHeader({ params }: Props) {
  const { quizId, lang } = await params;
  const locale = (locales as readonly string[]).includes(lang) ? (lang as Locale) : undefined;

  return (
    <div className="mb-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/quizz/${quizId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour au quizz
        </Link>
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">
        {locale ? `Traduire en ${localeLabels[locale]}` : "Traduire un quizz"}
      </h1>
    </div>
  );
}

async function TranslateQuizEditor({ params }: Props) {
  const { quizId, lang } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  if (!(locales as readonly string[]).includes(lang)) {
    notFound();
  }
  const locale = lang as Locale;

  const quiz = await getQuizById(quizId);
  if (!quiz) {
    notFound();
  }

  // Traduire, c'est modifier le contenu affiché : son auteur, ou la modération.
  const canWrite = await canManageQuiz(quiz, session.user.id).catch(() => false);
  if (!canWrite) {
    redirect(`/quizz/${quizId}`);
  }

  // Traduire un quizz vers sa propre langue n'a pas de sens : on renvoie vers
  // le quizz plutôt que d'ouvrir un éditeur qui ne mènerait à rien.
  if (locale === quiz.originalLang) {
    redirect(`/quizz/${quizId}`);
  }

  const existing = quiz.translations?.find((translation) => translation.lang === locale);

  return (
    <>
      <p className="text-muted-foreground -mt-4 mb-6">
        {quiz.title} — version originale en {localeLabels[quiz.originalLang]}. Un texte laissé vide reste
        affiché en version originale.
      </p>

      <QuizTranslationEditor
        quiz={quiz}
        lang={locale}
        initialTitle={existing?.title ?? ""}
        initialEntries={existing?.entries ?? {}}
      />
    </>
  );
}
