import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { getQuizById } from "@/lib/db/quizzes";
import { canManageQuiz } from "@/lib/quizzes/authorization";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import QuizTranslationEditor from "./QuizTranslationEditor";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type Props = { params: Promise<{ quizId: string; lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale = (locales as readonly string[]).includes(lang) ? (lang as Locale) : undefined;
  return { title: locale ? `Traduire en ${localeLabels[locale]}` : "Traduire un quizz" };
}

export default async function TranslateQuizPage({ params }: Props) {
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={`/quizz/${quizId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour au quizz
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Traduire en {localeLabels[locale]}</h1>
        <p className="text-muted-foreground mt-1">
          {quiz.title} — version originale en {localeLabels[quiz.originalLang]}. Un texte laissé vide reste
          affiché en version originale.
        </p>
      </div>

      <QuizTranslationEditor
        quiz={quiz}
        lang={locale}
        initialTitle={existing?.title ?? ""}
        initialEntries={existing?.entries ?? {}}
      />
    </div>
  );
}
