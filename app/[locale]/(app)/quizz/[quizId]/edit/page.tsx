import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getQuizById } from "@/lib/db/quizzes.ts";
import { canManageQuiz } from "@/lib/quizzes/authorization.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import QuizForm from "../../QuizForm.tsx";

type Props = { params: Promise<{ quizId: string }> };

export const metadata: Metadata = {
  title: "Modifier le quizz",
};

/**
 * L'en-tête ne dit rien que l'onglet ne dise déjà, sauf le lien de retour qui a
 * besoin de l'identifiant : lui seul est sous frontière. La porte — auteur ou
 * modération — et le formulaire qu'elle ouvre le sont aussi.
 */
export default function EditQuizzPage({ params }: Props) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Suspense fallback={<BackToQuizSkeleton />}>
          <BackToQuiz params={params} />
        </Suspense>
        <h1 className="text-3xl font-bold tracking-tight">Modifier le quizz</h1>
      </div>

      <Suspense fallback={<EditorFormSkeleton />}>
        <EditQuizForm params={params} />
      </Suspense>
    </div>
  );
}

function BackToQuizSkeleton() {
  return <div className="mb-4 h-8 w-40 animate-pulse rounded-md bg-muted" aria-hidden />;
}

async function BackToQuiz({ params }: Props) {
  const { quizId } = await params;

  return (
    <Button asChild variant="ghost" size="sm" className="mb-4">
      <Link href={`/quizz/${quizId}`}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour au quizz
      </Link>
    </Button>
  );
}

async function EditQuizForm({ params }: Props) {
  const { quizId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const [quiz, games] = await Promise.all([getQuizById(quizId), readAllGames()]);

  if (!quiz) {
    notFound();
  }

  // Son auteur, ou la modération : modifier le quizz de quelqu'un d'autre
  // demande `quizzes:update-all`.
  const canWrite = await canManageQuiz(quiz, session.user.id).catch(() => false);
  if (!canWrite) {
    redirect(`/quizz/${quizId}`);
  }

  // L'import par IA a son propre droit : rédiger un quizz ne donne pas accès au
  // modèle, dont chaque appel est facturé.
  const canImport = await hasPermission("quizzes:ai-import").catch(() => false);

  return <QuizForm mode="edit" quiz={quiz} games={games} canImport={canImport} />;
}
